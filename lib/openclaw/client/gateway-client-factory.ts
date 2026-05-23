import "server-only";

import { CliOpenClawGatewayClient } from "@/lib/openclaw/client/cli-gateway-client";
import {
  isCliGatewayClientForcedByEnv,
  NativeWsOpenClawGatewayClient
} from "@/lib/openclaw/client/native-ws-gateway-client";
import type { OpenClawGatewayClient } from "@/lib/openclaw/client/types";

let defaultClient: OpenClawGatewayClient | null = null;
let configuredProvider: OpenClawGatewayClientProvider | null = null;

export type OpenClawGatewayClientProvider = () => OpenClawGatewayClient;

function createDefaultOpenClawGatewayClient() {
  const cliClient = new CliOpenClawGatewayClient();

  if (isCliGatewayClientForcedByEnv()) {
    return cliClient;
  }

  return new NativeWsOpenClawGatewayClient({
    fallback: cliClient
  });
}

export function getOpenClawGatewayClient() {
  if (!defaultClient) {
    defaultClient = (configuredProvider ?? createDefaultOpenClawGatewayClient)();
  }

  return defaultClient;
}

export function resetOpenClawGatewayClient(reason = "reset") {
  const client = defaultClient;
  defaultClient = null;

  try {
    client?.close?.(reason);
  } catch {
    // Best-effort cleanup; the next request will create a fresh client.
  }
}

export function setOpenClawGatewayClientProvider(provider: OpenClawGatewayClientProvider | null) {
  resetOpenClawGatewayClient("provider changed");
  configuredProvider = provider;
}

export function setOpenClawGatewayClientForTesting(client: OpenClawGatewayClient | null) {
  resetOpenClawGatewayClient("testing client changed");
  defaultClient = client;
}
