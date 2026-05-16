import "server-only";

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { NativeWsOpenClawGatewayClient, type OpenClawGatewayEventSubscription } from "@/lib/openclaw/client/gateway-client";
import { getOpenClawCapabilityMatrix } from "@/lib/openclaw/application/capability-matrix-service";
import type { RuntimeRecord } from "@/lib/openclaw/types";

type GatewayEventFrame = {
  type?: string;
  event?: string;
  payload?: unknown;
};

const eventBridgeRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), ".mission-control", "gateway-events");
const maxBridgeRecords = 500;
let subscription: OpenClawGatewayEventSubscription | null = null;
let starting: Promise<void> | null = null;
let lastError: string | null = null;
let lastEventAt: string | null = null;
const bridgeEventSubscribers = new Set<(frame: GatewayEventFrame) => void>();

export function getOpenClawEventBridgeStatus() {
  return {
    connected: Boolean(subscription),
    lastEventAt,
    lastError
  };
}

export function startOpenClawEventBridge() {
  if (subscription || starting) {
    return;
  }

  starting = startEventBridge().finally(() => {
    starting = null;
  });
  void starting;
}

export function subscribeOpenClawEventBridgeEvents(callback: (frame: GatewayEventFrame) => void) {
  bridgeEventSubscribers.add(callback);
  startOpenClawEventBridge();

  return () => {
    bridgeEventSubscribers.delete(callback);
  };
}

export async function readOpenClawEventBridgeRuntimes(): Promise<RuntimeRecord[]> {
  try {
    const entries = await readdir(eventBridgeRoot, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => readBridgeRuntimeRecord(path.join(eventBridgeRoot, entry.name)))
    );

    return records
      .filter((record): record is RuntimeRecord => Boolean(record))
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .slice(0, maxBridgeRecords);
  } catch {
    return [];
  }
}

export function normalizeOpenClawGatewayEventToRuntime(frame: GatewayEventFrame): RuntimeRecord | null {
  const payload = isRecord(frame.payload) ? frame.payload : {};
  const eventName = readString(frame.event) ?? readString(payload.type) ?? "event";
  const sessionKey = readString(payload.sessionKey) ?? readString(payload.key);
  const agentId = readString(payload.agentId) ?? readString(payload.agent) ?? parseAgentIdFromSessionKey(sessionKey);
  const sessionId = readString(payload.sessionId) ?? readString(payload.session) ?? sessionKey;
  const runId = readString(payload.runId) ?? readString(payload.run) ?? readString(payload.clientRunId);
  const taskId = readString(payload.taskId);
  const timestamp = readTimestamp(payload.timestamp ?? payload.ts ?? payload.updatedAt);
  const status = normalizeStatus(readString(payload.status) ?? eventName);
  const text =
    readString(payload.text) ??
    readString(payload.message) ??
    readString(payload.summary) ??
    readString(payload.detail) ??
    eventName;
  const runtimeId =
    readString(payload.runtimeId) ??
    `runtime:gateway:${stableRuntimeIdentity(agentId, sessionId, runId, taskId, eventName)}`;

  if (!agentId && !sessionId && !runId && !taskId) {
    return null;
  }

  return {
    id: runtimeId,
    source: "turn",
    key: runId || sessionId || taskId || runtimeId,
    title: readString(payload.title) ?? (taskId ? "Gateway task event" : "Gateway runtime event"),
    subtitle: text,
    status,
    updatedAt: timestamp,
    ageMs: timestamp ? Math.max(0, Date.now() - timestamp) : null,
    agentId: agentId ?? undefined,
    sessionId: sessionId ?? undefined,
    taskId: taskId ?? undefined,
    runId: runId ?? undefined,
    modelId: readString(payload.model) ?? readString(payload.modelId) ?? undefined,
    toolNames: normalizeToolNames(payload),
    metadata: {
      origin: "openclaw-gateway-event",
      event: eventName,
      channel: readString(payload.channel) ?? null,
      approvalId: readString(payload.approvalId) ?? null,
      mission: readString(payload.mission) ?? readString(payload.prompt) ?? null
    }
  };
}

async function startEventBridge() {
  const capabilityMatrix = await getOpenClawCapabilityMatrix().catch(() => null);
  if (capabilityMatrix?.eventBridge === "unsupported") {
    lastError = "OpenClaw Gateway does not advertise compatible session/event support.";
    return;
  }

  const client = new NativeWsOpenClawGatewayClient({ timeoutMs: 5_000 });
  try {
    subscription = await client.subscribeNativeEvents(
      {
        subscribeSessions: true
      },
      {
        onEvent: (frame) => {
          notifyBridgeEventSubscribers(frame);
          void persistGatewayEvent(frame).catch((error) => {
            lastError = error instanceof Error ? error.message : String(error);
          });
        },
        onError: (error) => {
          lastError = error instanceof Error ? error.message : String(error);
        },
        onClose: () => {
          subscription = null;
        }
      },
      { timeoutMs: 5_000 }
    );
    lastError = null;
  } catch (error) {
    subscription = null;
    lastError = error instanceof Error ? error.message : String(error);
  }
}

function notifyBridgeEventSubscribers(frame: GatewayEventFrame) {
  for (const subscriber of [...bridgeEventSubscribers]) {
    try {
      subscriber(frame);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
}

async function persistGatewayEvent(frame: GatewayEventFrame) {
  const runtime = normalizeOpenClawGatewayEventToRuntime(frame);
  if (!runtime) {
    return;
  }

  lastEventAt = new Date(runtime.updatedAt ?? Date.now()).toISOString();
  await mkdir(eventBridgeRoot, { recursive: true });
  const filePath = path.join(eventBridgeRoot, `${safeFileName(runtime.id)}.json`);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function readBridgeRuntimeRecord(filePath: string): Promise<RuntimeRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<RuntimeRecord>;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.key !== "string") {
      return null;
    }

    return {
      id: parsed.id,
      source: parsed.source === "session" || parsed.source === "cron" ? parsed.source : "turn",
      key: parsed.key,
      title: typeof parsed.title === "string" ? parsed.title : "Gateway runtime event",
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "OpenClaw Gateway event",
      status: parsed.status ?? "running",
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
      ageMs: typeof parsed.updatedAt === "number" ? Math.max(0, Date.now() - parsed.updatedAt) : null,
      agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : undefined,
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : undefined,
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : undefined,
      runId: typeof parsed.runId === "string" ? parsed.runId : undefined,
      toolNames: Array.isArray(parsed.toolNames) ? parsed.toolNames.filter((entry): entry is string => typeof entry === "string") : undefined,
      tokenUsage: parsed.tokenUsage,
      metadata: isRecord(parsed.metadata) ? parsed.metadata : {}
    };
  } catch {
    return null;
  }
}

function normalizeStatus(value: string) {
  if (/complete|done|success/i.test(value)) {
    return "completed";
  }

  if (/cancel|abort/i.test(value)) {
    return "cancelled";
  }

  if (/error|fail|stall/i.test(value)) {
    return "stalled";
  }

  if (/queue/i.test(value)) {
    return "queued";
  }

  return "running";
}

function normalizeToolNames(payload: Record<string, unknown>) {
  const names = [
    readString(payload.toolName),
    readString(payload.tool)
  ].filter((entry): entry is string => Boolean(entry));
  return names.length > 0 ? Array.from(new Set(names)) : undefined;
}

function stableRuntimeIdentity(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(":").replace(/[^a-zA-Z0-9:_-]+/g, "-") || String(Date.now());
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function readTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  return Date.now();
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAgentIdFromSessionKey(sessionKey: string | null) {
  if (!sessionKey?.startsWith("agent:")) {
    return null;
  }

  const [, agentId] = sessionKey.split(":");
  return agentId || null;
}
