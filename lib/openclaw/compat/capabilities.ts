import {
  OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS,
  OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS
} from "@/lib/openclaw/client/gateway-compatibility";
import { compareVersionStrings } from "@/lib/openclaw/domains/control-plane-normalization";
import { OPENCLAW_SUPPORTED_BASELINE_VERSION } from "@/lib/openclaw/versions";
import type {
  OpenClawCompatibilityCapability,
  OpenClawCompatibilityCapabilityId,
  OpenClawCompatibilityCapabilitySource,
  OpenClawCompatibilityDetectionInput,
  OpenClawCompatibilityMethodSource,
  OpenClawCompatibilitySupportStatus
} from "@/lib/openclaw/compat/types";

type CapabilityDefinition = {
  id: OpenClawCompatibilityCapabilityId;
  label: string;
  methods: string[];
  events?: string[];
};

const capabilityDefinitions: CapabilityDefinition[] = [
  {
    id: "gatewayHealth",
    label: "Gateway health",
    methods: ["health", "status", "logs.tail"]
  },
  {
    id: "sessions",
    label: "Sessions",
    methods: [
      "sessions.list",
      "sessions.create",
      "sessions.patch",
      "sessions.steer",
      "sessions.preview",
      "sessions.get",
      "sessions.describe",
      "sessions.subscribe"
    ],
    events: ["session.message", "session.tool", "sessions.changed"]
  },
  {
    id: "chat",
    label: "Chat",
    methods: ["chat.send", "sessions.send", "chat.history", "chat.abort", "chat.inject"],
    events: ["chat", "agent", "session.message", "session.tool"]
  },
  {
    id: "models",
    label: "Models",
    methods: ["models.list", "models.authStatus", "models.scan", "models.authOrder.set", "models.auth.order.set"]
  },
  {
    id: "authProfiles",
    label: "Auth profiles",
    methods: ["models.authStatus", "models.authOrder.set", "models.auth.order.set"]
  },
  {
    id: "accountsBrowserProfiles",
    label: "Accounts/browser profiles",
    methods: ["browser.request", "channels.status", "channels.list"]
  },
  {
    id: "tasks",
    label: "Tasks",
    methods: ["tasks.list", "tasks.get", "tasks.assign", "tasks.cancel", "tasks.subscribe"],
    events: ["task", "task.updated", "task.completed"]
  },
  {
    id: "config",
    label: "Config",
    methods: ["config.get", "config.set", "config.schema", "config.schema.lookup", "config.patch", "config.apply"]
  },
  {
    id: "transcripts",
    label: "Transcripts",
    methods: ["chat.history", "sessions.preview", "sessions.get", "sessions.describe", "sessions.messages.subscribe"],
    events: ["session.message", "session.tool"]
  },
  {
    id: "cliFallback",
    label: "CLI fallback availability",
    methods: [],
    events: []
  }
];

export function resolveOpenClawCompatibilityMethods(input: {
  advertisedMethods: string[];
  advertisedEvents: string[];
  installedVersion: string | null;
  source: OpenClawCompatibilityMethodSource;
}) {
  const advertisedMethods = uniqueSorted(input.advertisedMethods);
  const advertisedEvents = uniqueSorted(input.advertisedEvents);

  if (advertisedMethods.length > 0 || advertisedEvents.length > 0) {
    return {
      advertisedMethods,
      advertisedEvents,
      effectiveMethods: advertisedMethods,
      effectiveEvents: advertisedEvents,
      source: input.source === "unavailable" ? "gateway-advertised" as const : input.source
    };
  }

  if (isAtLeastBaseline(input.installedVersion)) {
    return {
      advertisedMethods,
      advertisedEvents,
      effectiveMethods: uniqueSorted([
        ...OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS,
        ...OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS
      ]),
      effectiveEvents: [],
      source: "version-default" as const
    };
  }

  return {
    advertisedMethods,
    advertisedEvents,
    effectiveMethods: [],
    effectiveEvents: [],
    source: "unavailable" as const
  };
}

export function buildOpenClawCompatibilityCapabilities(
  input: OpenClawCompatibilityDetectionInput & {
    effectiveMethods: string[];
    effectiveEvents: string[];
  }
): OpenClawCompatibilityCapability[] {
  const methodSet = new Set(input.effectiveMethods);
  const eventSet = new Set(input.effectiveEvents);
  const source = toCapabilitySource(input.source);

  return capabilityDefinitions.map((definition) => {
    if (definition.id === "cliFallback") {
      return {
        id: definition.id,
        label: definition.label,
        status: input.cliFallbackAvailable ? "supported" : "not-available",
        source: "cli-probe",
        methods: [],
        events: [],
        supportedMethods: [],
        supportedEvents: [],
        reason: input.cliFallbackAvailable
          ? "OpenClaw CLI is available for explicit recovery fallback operations."
          : "OpenClaw CLI was not available, so recovery fallback operations cannot run."
      } satisfies OpenClawCompatibilityCapability;
    }

    const methods = uniqueSorted(definition.methods);
    const events = uniqueSorted(definition.events ?? []);
    const supportedMethods = methods.filter((method) => methodSet.has(method));
    const supportedEvents = events.filter((event) => eventSet.has(event));
    const status = resolveCapabilityStatus({
      supportedMethods,
      supportedEvents,
      hasEffectiveCapabilities: methodSet.size > 0 || eventSet.size > 0
    });

    return {
      id: definition.id,
      label: definition.label,
      status,
      source: status === "unknown" ? "not-available" : source,
      methods,
      events,
      supportedMethods,
      supportedEvents,
      reason: resolveCapabilityReason(definition.label, status, source, supportedMethods, supportedEvents)
    } satisfies OpenClawCompatibilityCapability;
  });
}

export function uniqueSorted(values: readonly string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).sort();
}

function resolveCapabilityStatus(input: {
  supportedMethods: string[];
  supportedEvents: string[];
  hasEffectiveCapabilities: boolean;
}): OpenClawCompatibilitySupportStatus {
  if (input.supportedMethods.length > 0 || input.supportedEvents.length > 0) {
    return "supported";
  }

  return input.hasEffectiveCapabilities ? "unsupported" : "unknown";
}

function resolveCapabilityReason(
  label: string,
  status: OpenClawCompatibilitySupportStatus,
  source: OpenClawCompatibilityCapabilitySource,
  supportedMethods: string[],
  supportedEvents: string[]
) {
  if (status === "supported") {
    const evidence = [...supportedMethods, ...supportedEvents].slice(0, 4).join(", ");
    return `${label} is available via ${source === "version-default" ? "version-based safe defaults" : "Gateway capability metadata"}${evidence ? ` (${evidence})` : ""}.`;
  }

  if (status === "unsupported") {
    return `${label} was not present in the detected OpenClaw capability set.`;
  }

  if (status === "not-available") {
    return `${label} is not available in this environment.`;
  }

  return `${label} could not be detected because OpenClaw did not provide capability metadata and no safe version default applies.`;
}

function toCapabilitySource(source: OpenClawCompatibilityMethodSource): OpenClawCompatibilityCapabilitySource {
  switch (source) {
    case "gateway-discovery":
      return "gateway-discovery";
    case "version-default":
      return "version-default";
    case "gateway-advertised":
      return "gateway-advertised";
    case "unavailable":
    default:
      return "not-available";
  }
}

function isAtLeastBaseline(version: string | null) {
  const normalized = version?.trim().replace(/^v/i, "");
  return Boolean(normalized && compareVersionStrings(normalized, OPENCLAW_SUPPORTED_BASELINE_VERSION) >= 0);
}
