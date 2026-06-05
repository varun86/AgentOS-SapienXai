import type { ConfigUpdatePacingSettings } from "@/lib/openclaw/domains/control-plane-settings";

export type ConfigUpdatePacingSnapshot = {
  settings: ConfigUpdatePacingSettings;
  pending: boolean;
  pendingCount: number;
  pendingPaths: string[];
  cooldownUntil: string | null;
  retryAfterMs: number | null;
  lastIssue: string | null;
  lastUpdatedAt: string | null;
};
