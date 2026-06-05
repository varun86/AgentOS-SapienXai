import "server-only";

import type { CommandResult } from "@/lib/openclaw/cli";
import {
  isGatewayConfigRateLimitError,
  readGatewayConfigRateLimitRetryAfterMs
} from "@/lib/openclaw/client/native-ws-gateway-config";
import {
  getEffectiveConfigUpdatePacing,
  readMissionControlSettings,
  type ConfigUpdatePacingSettings
} from "@/lib/openclaw/domains/control-plane-settings";
import type { ConfigUpdatePacingSnapshot } from "@/lib/openclaw/config-pacing-types";

type ConfigMutationOperation = "set" | "unset";

type QueuedConfigMutation = {
  key: string;
  path: string;
  operation: ConfigMutationOperation;
  value: unknown;
  execute: () => Promise<CommandResult>;
  queuedAt: number;
};

const queuedMutations = new Map<string, QueuedConfigMutation>();
let gatewayCooldownUntilMs = 0;
let localNextAllowedAtMs = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let lastIssue: string | null = null;
let lastUpdatedAtMs: number | null = null;
let pacingSettingsForTesting: ConfigUpdatePacingSettings | null = null;

export async function runGatewayConfigMutationWithPacing(input: {
  path: string;
  operation: ConfigMutationOperation;
  value: unknown;
  execute: () => Promise<CommandResult>;
}) {
  const now = Date.now();
  const pacing = await readEffectivePacing();
  const waitUntilMs = resolveWaitUntilMs(now);

  if (waitUntilMs > now) {
    queueLatestMutation(input, now);
    scheduleQueuedConfigFlush(waitUntilMs - now);
    return buildQueuedConfigMutationResult(input, waitUntilMs, "pending");
  }

  try {
    const result = await input.execute();
    markLocalPacingAfterMutation(pacing);
    return result;
  } catch (error) {
    if (!isGatewayConfigRateLimitError(error)) {
      throw error;
    }

    const retryAfterMs = readGatewayConfigRateLimitRetryAfterMs(error) ?? 60_000;
    const cooldownUntilMs = Date.now() + retryAfterMs;
    gatewayCooldownUntilMs = Math.max(gatewayCooldownUntilMs, cooldownUntilMs);
    lastIssue = readErrorMessage(error);
    lastUpdatedAtMs = Date.now();
    queueLatestMutation(input, lastUpdatedAtMs);
    scheduleQueuedConfigFlush(resolveWaitDelayMs());

    return buildQueuedConfigMutationResult(input, gatewayCooldownUntilMs, "rate-limited");
  }
}

export async function getConfigUpdatePacingSnapshot(): Promise<ConfigUpdatePacingSnapshot> {
  return buildConfigUpdatePacingSnapshot(await readEffectivePacing());
}

export function getConfigUpdatePacingSnapshotForSettings(
  settings: Awaited<ReturnType<typeof readMissionControlSettings>>
): ConfigUpdatePacingSnapshot {
  return buildConfigUpdatePacingSnapshot(getEffectiveConfigUpdatePacing(settings));
}

export function resetConfigUpdatePacingForTesting() {
  queuedMutations.clear();
  gatewayCooldownUntilMs = 0;
  localNextAllowedAtMs = 0;
  flushing = false;
  lastIssue = null;
  lastUpdatedAtMs = null;
  pacingSettingsForTesting = null;

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function setConfigUpdatePacingForTesting(settings: ConfigUpdatePacingSettings | null) {
  pacingSettingsForTesting = settings;
}

function queueLatestMutation(input: {
  path: string;
  operation: ConfigMutationOperation;
  value: unknown;
  execute: () => Promise<CommandResult>;
}, queuedAt: number) {
  const key = input.path;
  queuedMutations.set(key, {
    key,
    path: input.path,
    operation: input.operation,
    value: input.value,
    execute: input.execute,
    queuedAt
  });
  lastUpdatedAtMs = queuedAt;
}

async function flushQueuedConfigMutations() {
  if (flushing) {
    return;
  }

  const now = Date.now();
  const waitUntilMs = resolveWaitUntilMs(now);
  if (waitUntilMs > now) {
    scheduleQueuedConfigFlush(waitUntilMs - now);
    return;
  }

  const next = queuedMutations.values().next().value as QueuedConfigMutation | undefined;
  if (!next) {
    return;
  }

  queuedMutations.delete(next.key);
  flushing = true;

  try {
    const pacing = await readEffectivePacing();
    await next.execute();
    markLocalPacingAfterMutation(pacing);
    lastIssue = null;
    lastUpdatedAtMs = Date.now();
  } catch (error) {
    if (isGatewayConfigRateLimitError(error)) {
      const retryAfterMs = readGatewayConfigRateLimitRetryAfterMs(error) ?? 60_000;
      gatewayCooldownUntilMs = Math.max(gatewayCooldownUntilMs, Date.now() + retryAfterMs);
      lastIssue = readErrorMessage(error);
      queueLatestMutation(next, Date.now());
    } else {
      lastIssue = readErrorMessage(error);
      lastUpdatedAtMs = Date.now();
    }
  } finally {
    flushing = false;
  }

  if (queuedMutations.size > 0) {
    scheduleQueuedConfigFlush(resolveWaitDelayMs());
  }
}

function scheduleQueuedConfigFlush(delayMs: number) {
  if (retryTimer) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueuedConfigMutations();
  }, Math.max(0, delayMs));
  retryTimer.unref?.();
}

function resolveWaitUntilMs(now = Date.now()) {
  const waitUntilMs = Math.max(gatewayCooldownUntilMs, localNextAllowedAtMs);
  return waitUntilMs > now ? waitUntilMs : 0;
}

function resolveWaitDelayMs() {
  const now = Date.now();
  const waitUntilMs = resolveWaitUntilMs(now);
  return waitUntilMs > now ? waitUntilMs - now : 0;
}

function markLocalPacingAfterMutation(pacing: ConfigUpdatePacingSettings) {
  const intervalMs = pacing.minimumIntervalMs ?? 0;

  if (intervalMs <= 0) {
    return;
  }

  localNextAllowedAtMs = Math.max(localNextAllowedAtMs, Date.now() + intervalMs);
}

function buildQueuedConfigMutationResult(
  input: { path: string; operation: ConfigMutationOperation },
  retryAtMs: number,
  reason: "pending" | "rate-limited"
): CommandResult {
  const message = reason === "rate-limited"
    ? "OpenClaw Gateway is rate limiting config updates. AgentOS queued the latest config update and will retry after the Gateway cooldown. CLI fallback is disabled for this operation."
    : "AgentOS queued the latest config update and will retry when config update pacing allows it.";

  return {
    stdout: JSON.stringify({
      ok: true,
      pending: true,
      path: input.path,
      operation: input.operation,
      retryAt: new Date(retryAtMs).toISOString(),
      message
    }),
    stderr: "",
    metadata: {
      pending: true,
      path: input.path,
      operation: input.operation,
      retryAt: new Date(retryAtMs).toISOString(),
      reason
    }
  };
}

function buildConfigUpdatePacingSnapshot(settings: ConfigUpdatePacingSettings): ConfigUpdatePacingSnapshot {
  const now = Date.now();
  const waitUntilMs = resolveWaitUntilMs(now);
  const pendingPaths = Array.from(queuedMutations.keys()).sort();

  return {
    settings,
    pending: pendingPaths.length > 0,
    pendingCount: pendingPaths.length,
    pendingPaths,
    cooldownUntil: waitUntilMs > now ? new Date(waitUntilMs).toISOString() : null,
    retryAfterMs: waitUntilMs > now ? waitUntilMs - now : null,
    lastIssue,
    lastUpdatedAt: lastUpdatedAtMs ? new Date(lastUpdatedAtMs).toISOString() : null
  };
}

async function readEffectivePacing() {
  if (pacingSettingsForTesting) {
    return pacingSettingsForTesting;
  }

  return getEffectiveConfigUpdatePacing(await readMissionControlSettings());
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "OpenClaw Gateway config update failed.");
}
