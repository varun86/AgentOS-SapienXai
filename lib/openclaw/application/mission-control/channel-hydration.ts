import "server-only";

import { settleChannelRegistryFromLocalFile } from "@/lib/openclaw/state/channel-registry-payload";
import { channelRegistryPath } from "@/lib/openclaw/state/paths";
import {
  applyChannelAccountDisplayNames,
  buildLegacyRegistrySurfaceAccounts,
  mergeMissionControlSurfaceAccounts,
  readChannelAccounts
} from "@/lib/openclaw/domains/channels";
import { normalizeChannelRegistry } from "@/lib/openclaw/domains/workspace-manifest";
import type { ChannelAccountRecord } from "@/lib/openclaw/types";
import type { SnapshotLoadProfile } from "@/lib/openclaw/state/snapshot-cache";

export async function hydrateMissionControlChannels(profile: SnapshotLoadProfile) {
  const channelRegistryResult = await settleChannelRegistryFromLocalFile(channelRegistryPath);
  const channelRegistry =
    channelRegistryResult.status === "fulfilled"
      ? channelRegistryResult.value
      : normalizeChannelRegistry({
          version: 1,
          channels: []
        });
  const channelAccountsRaw =
    profile === "interactive"
      ? ([] as ChannelAccountRecord[])
      : await readChannelAccounts();
  const channelAccounts = applyChannelAccountDisplayNames(
    mergeMissionControlSurfaceAccounts([
      ...channelAccountsRaw,
      ...buildLegacyRegistrySurfaceAccounts(channelRegistry)
    ]),
    channelRegistry
  );

  return {
    channelRegistry,
    channelAccounts
  };
}
