import "server-only";

import { getOpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import type { OpenClawGatewayClientError } from "@/lib/openclaw/client/gateway-client";
import { NativeWsOpenClawGatewayClient, isCliGatewayClientForcedByEnv } from "@/lib/openclaw/client/gateway-client";
import type { OpenClawCapabilityMatrix, OpenClawCapabilitySupport } from "@/lib/openclaw/types";

const capabilityCacheTtlMs = 60_000;
const knownGatewayFirstMethods = [
  "health",
  "status",
  "diagnostics.stability",
  "models.list",
  "models.authStatus",
  "agents.list",
  "agents.create",
  "agents.update",
  "agents.delete",
  "agents.files.list",
  "agents.files.get",
  "agents.files.set",
  "sessions.list",
  "sessions.create",
  "sessions.send",
  "sessions.abort",
  "sessions.subscribe",
  "sessions.messages.subscribe",
  "tasks.list",
  "tasks.get",
  "tasks.cancel",
  "chat.history",
  "chat.send",
  "chat.abort",
  "config.get",
  "config.set",
  "config.schema",
  "config.schema.lookup",
  "config.patch",
  "config.apply",
  "channels.status",
  "channels.start",
  "channels.stop",
  "channels.logout",
  "skills.status",
  "skills.search",
  "skills.detail",
  "skills.install",
  "skills.update",
  "plugins.uiDescriptors",
  "exec.approval.list",
  "exec.approval.resolve",
  "plugin.approval.list",
  "plugin.approval.resolve",
  "update.status",
  "update.run",
  "gateway.restart.preflight",
  "gateway.restart.request"
];

let cachedCapabilityMatrix: {
  capturedAt: number;
  value: OpenClawCapabilityMatrix;
} | null = null;
let nativeCapabilityCallerForTesting: ((method: string) => Promise<unknown>) | null = null;

export function clearOpenClawCapabilityMatrixCacheForTesting() {
  cachedCapabilityMatrix = null;
  nativeCapabilityCallerForTesting = null;
}

export function setOpenClawCapabilityMatrixNativeCallerForTesting(
  caller: ((method: string) => Promise<unknown>) | null
) {
  nativeCapabilityCallerForTesting = caller;
  cachedCapabilityMatrix = null;
}

export async function getOpenClawCapabilityMatrix(options: { force?: boolean } = {}) {
  if (!options.force && cachedCapabilityMatrix && Date.now() - cachedCapabilityMatrix.capturedAt < capabilityCacheTtlMs) {
    return cachedCapabilityMatrix.value;
  }

  const matrix = await detectOpenClawCapabilityMatrix();
  cachedCapabilityMatrix = {
    capturedAt: Date.now(),
    value: matrix
  };

  return matrix;
}

export function getCachedOpenClawCapabilityMatrix() {
  return cachedCapabilityMatrix && Date.now() - cachedCapabilityMatrix.capturedAt < capabilityCacheTtlMs
    ? cachedCapabilityMatrix.value
    : null;
}

export function warmOpenClawCapabilityMatrix() {
  void getOpenClawCapabilityMatrix().catch(() => {});
}

async function detectOpenClawCapabilityMatrix(): Promise<OpenClawCapabilityMatrix> {
  const diagnostics: string[] = [];
  const status = await getOpenClawAdapter().getStatus({ timeoutMs: 5_000 }).catch((error) => {
    diagnostics.push(`status: ${readErrorMessage(error)}`);
    return null;
  });
  const version = readString(status?.runtimeVersion) ?? readString(status?.overview?.version) ?? readString(status?.version);
  let protocolVersion: string | null = null;
  let authMode: string | null = null;
  let supportedMethods: string[] = [];
  let supportedEvents: string[] = [];

  if (isCliGatewayClientForcedByEnv()) {
    diagnostics.push("Native Gateway WS is disabled by environment configuration.");
  } else {
    if (nativeCapabilityCallerForTesting) {
      const capabilityPayload = await callFirstSupported(nativeCapabilityCallerForTesting, [
        "rpc.discover",
        "rpc.methods",
        "system.capabilities",
        "capabilities"
      ], diagnostics);

      protocolVersion = readProtocolVersion(capabilityPayload);
      authMode = readAuthMode(capabilityPayload);
      supportedMethods = readSupportedMethods(capabilityPayload);
      supportedEvents = readSupportedEvents(capabilityPayload);
    } else {
      try {
        const hello = await new NativeWsOpenClawGatewayClient({ timeoutMs: 2_500 }).probeNativeHandshake({
          timeoutMs: 2_500
        });
        protocolVersion = readProtocolVersion(hello);
        authMode = readAuthMode(hello);
        supportedMethods = readSupportedMethods(hello);
        supportedEvents = readSupportedEvents(hello);
      } catch (error) {
        diagnostics.push(`handshake: ${readErrorMessage(error)}`);
      }
    }
  }

  const methodSet = new Set(supportedMethods);
  const eventSet = new Set(supportedEvents);
  const support = (...methods: string[]): OpenClawCapabilitySupport => {
    if (methodSet.size === 0) {
      return "unknown";
    }

    return methods.some((method) => methodSet.has(method)) ? "supported" : "unsupported";
  };
  const unsupportedGatewayMethods = methodSet.size > 0
    ? knownGatewayFirstMethods.filter((method) => !methodSet.has(method))
    : [];

  return {
    detectedAt: new Date().toISOString(),
    openClawVersion: version ?? null,
    gatewayProtocolVersion: protocolVersion,
    authMode,
    supportedMethods,
    configSchema: support("config.schema"),
    configPatch: support("config.patch", "config.apply"),
    chatEvents: support("chat.send", "chat.history") === "supported" ||
      ["chat", "agent", "session.message", "session.tool"].some((event) => eventSet.has(event))
      ? "supported"
      : methodSet.size === 0
        ? "unknown"
        : "unsupported",
    channels: support("channels.status"),
    skills: support("skills.status"),
    approvals: support("exec.approval.list", "exec.approval.resolve", "plugin.approval.list", "plugin.approval.resolve"),
    updates: support("update.status", "update.run", "status"),
    nativeMissionDispatch: support("chat.send", "sessions.send"),
    nativeAgentLifecycle: support("agents.create", "agents.update", "agents.delete"),
    eventBridge: support("sessions.subscribe") === "supported" ||
      ["chat", "agent", "session.message", "session.tool", "exec.approval.requested", "plugin.approval.requested"].some((event) => eventSet.has(event))
      ? "supported"
      : methodSet.size === 0
        ? "unknown"
        : "unsupported",
    unsupportedGatewayMethods,
    diagnostics
  };
}

async function callFirstSupported(
  caller: (method: string) => Promise<unknown>,
  methods: string[],
  diagnostics: string[]
) {
  for (const method of methods) {
    try {
      return await caller(method);
    } catch (error) {
      diagnostics.push(`${method}: ${readErrorMessage(error)}`);
    }
  }

  return null;
}

function readSupportedMethods(payload: unknown) {
  const direct = readStringArray(readProperty(payload, "methods"));
  const nested = readStringArray(readProperty(readProperty(payload, "rpc"), "methods"));
  const features = readStringArray(readProperty(readProperty(payload, "features"), "methods"));
  const supported = readStringArray(readProperty(payload, "supportedMethods"));
  const methodObjects = readMethodObjects(readProperty(payload, "methods"));

  return Array.from(new Set([...direct, ...nested, ...features, ...supported, ...methodObjects])).sort();
}

function readSupportedEvents(payload: unknown) {
  const direct = readStringArray(readProperty(payload, "events"));
  const features = readStringArray(readProperty(readProperty(payload, "features"), "events"));
  return Array.from(new Set([...direct, ...features])).sort();
}

function readMethodObjects(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(readProperty(entry, "name")) ?? readString(readProperty(entry, "method")))
    .filter((entry): entry is string => Boolean(entry));
}

function readProtocolVersion(payload: unknown) {
  const value =
    readProperty(payload, "protocolVersion") ??
    readProperty(payload, "protocol") ??
    readProperty(readProperty(payload, "gateway"), "protocolVersion");

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return readString(value);
}

function readAuthMode(payload: unknown) {
  return (
    readString(readProperty(payload, "authMode")) ??
    readString(readProperty(readProperty(payload, "auth"), "mode")) ??
    readString(readProperty(readProperty(payload, "security"), "authMode")) ??
    readString(readProperty(readProperty(payload, "snapshot"), "authMode"))
  );
}

function readProperty(value: unknown, key: string) {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function readErrorMessage(error: unknown) {
  const gatewayError = error as OpenClawGatewayClientError;
  return error instanceof Error
    ? gatewayError.kind
      ? `${gatewayError.kind}: ${error.message}`
      : error.message
    : String(error || "OpenClaw Gateway request failed.");
}
