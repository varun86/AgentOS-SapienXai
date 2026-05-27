import { NextResponse } from "next/server";

import {
  getIntegrationDescriptor,
  isIntegrationId
} from "@/lib/agentos/integrations/registry";
import type { IntegrationStatus } from "@/lib/agentos/integrations/state";
import { getOpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import type { OpenClawChannelStatusPayload } from "@/lib/openclaw/client/types";
import { redactErrorMessage, redactSecretText } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await context.params;

  if (!isIntegrationId(integrationId)) {
    return NextResponse.json(
      {
        error: "Unknown integration."
      },
      { status: 404 }
    );
  }

  const descriptor = getIntegrationDescriptor(integrationId);
  if (!descriptor?.surfaceProvider) {
    return NextResponse.json(
      {
        error: "This integration does not expose an OpenClaw channel status check."
      },
      { status: 400 }
    );
  }

  try {
    const payload = await getOpenClawAdapter().getChannelStatus(
      {
        probe: true,
        timeoutMs: 5_000
      },
      {
        timeoutMs: 7_000
      }
    );
    const resolved = resolveChannelIntegrationStatus(payload, descriptor.surfaceProvider);

    return NextResponse.json({
      ok: resolved.status === "connected",
      status: resolved.status,
      statusLabel: resolved.statusLabel,
      connectionHealth: resolved.connectionHealth,
      lastSyncLabel: "Checked just now",
      uptimeLabel: "Unavailable from OpenClaw",
      rateLimitLabel: "Unavailable from OpenClaw",
      errorMessage: resolved.errorMessage,
      sourceMethods: ["OpenClawAdapter.getChannelStatus", "channels.status"]
    });
  } catch (error) {
    const message = redactErrorMessage(error, "OpenClaw channel status is unavailable.");

    return NextResponse.json({
      ok: false,
      status: "unknown",
      statusLabel: "Unknown",
      connectionHealth: {
        label: "OpenClaw status unavailable",
        detail: message
      },
      lastSyncLabel: "Check failed",
      uptimeLabel: "Unavailable from OpenClaw",
      rateLimitLabel: "Unavailable from OpenClaw",
      errorMessage: message,
      sourceMethods: ["OpenClawAdapter.getChannelStatus", "channels.status"]
    });
  }
}

function resolveChannelIntegrationStatus(
  payload: OpenClawChannelStatusPayload,
  provider: string
): {
  status: IntegrationStatus;
  statusLabel: string;
  connectionHealth: {
    label: string;
    detail: string;
  };
  errorMessage: string | null;
} {
  const accounts = payload.channelAccounts?.[provider] ?? [];
  const accountError = accounts.find((account) => typeof account.lastError === "string" && account.lastError.trim());

  if (accountError?.lastError) {
    const safeError = redactSecretText(accountError.lastError);
    return {
      status: "failed",
      statusLabel: "Failed",
      connectionHealth: {
        label: "Connector error",
        detail: safeError
      },
      errorMessage: safeError
    };
  }

  if (accounts.length === 0) {
    return {
      status: "missing-credentials",
      statusLabel: "Missing Credentials",
      connectionHealth: {
        label: "No OpenClaw account",
        detail: "OpenClaw channels.status did not return an account for this provider."
      },
      errorMessage: null
    };
  }

  if (accounts.every((account) => account.enabled === false)) {
    return {
      status: "disabled",
      statusLabel: "Disabled",
      connectionHealth: {
        label: "Disabled",
        detail: "OpenClaw returned account records, but every account is disabled."
      },
      errorMessage: null
    };
  }

  const connectedAccounts = accounts.filter(
    (account) => account.connected === true || account.running === true || account.linked === true
  );

  if (connectedAccounts.length > 0) {
    return {
      status: "connected",
      statusLabel: "Connected",
      connectionHealth: {
        label: "Verified by OpenClaw",
        detail: `${connectedAccounts.length} account${connectedAccounts.length === 1 ? "" : "s"} returned connected, running, or linked from channels.status.`
      },
      errorMessage: null
    };
  }

  const configuredAccounts = accounts.filter(
    (account) => account.configured === true || account.enabled === true
  );

  if (configuredAccounts.length > 0) {
    return {
      status: "unknown",
      statusLabel: "Unknown",
      connectionHealth: {
        label: "Configured, not live-verified",
        detail: "OpenClaw returned configured account records, but no account reported connected, running, or linked."
      },
      errorMessage: null
    };
  }

  return {
    status: "pending-setup",
    statusLabel: "Pending Setup",
    connectionHealth: {
      label: "Setup incomplete",
      detail: "OpenClaw returned account records without configured or connected state."
    },
    errorMessage: null
  };
}
