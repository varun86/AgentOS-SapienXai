import { NextResponse } from "next/server";
import { z } from "zod";

import {
  generateGatewayNativeAuthToken,
  getGatewayNativeAuthStatus,
  repairGatewayNativeDeviceAccess,
  saveGatewayNativeAuthCredential,
  updateGatewayRemoteUrl
} from "@/lib/agentos/control-plane";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gatewaySettingsSchema = z.object({
  gatewayUrl: z.string().max(2048).optional().nullable()
});

const gatewayAuthCredentialSchema = z.object({
  action: z.literal("saveCredential").optional(),
  kind: z.enum(["token", "password"]),
  value: z.string().min(1).max(4096)
});

const gatewayAuthGenerateSchema = z.object({
  action: z.literal("generateLocalToken")
});

const gatewayAuthRepairSchema = z.object({
  action: z.literal("repairDeviceAccess")
});

export async function GET() {
  try {
    const authStatus = await getGatewayNativeAuthStatus();

    return NextResponse.json({
      authStatus: redactSecrets(authStatus)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to inspect the OpenClaw gateway auth status.")
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const input = gatewaySettingsSchema.parse(await request.json());
    const snapshot = await updateGatewayRemoteUrl({
      gatewayUrl: input.gatewayUrl ?? null
    });

    return NextResponse.json({
      snapshot: redactSecrets(snapshot)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to update the OpenClaw gateway.")
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (gatewayAuthGenerateSchema.safeParse(body).success) {
      const result = await generateGatewayNativeAuthToken();
      const authStatus = await getGatewayNativeAuthStatus();

      return NextResponse.json({
        saved: true,
        generated: true,
        result: redactSecrets(result),
        authStatus: redactSecrets(authStatus)
      });
    }

    if (gatewayAuthRepairSchema.safeParse(body).success) {
      const result = await repairGatewayNativeDeviceAccess();
      const authStatus = await getGatewayNativeAuthStatus();

      return NextResponse.json({
        saved: true,
        repaired: true,
        result: redactSecrets(result),
        authStatus: redactSecrets(authStatus)
      });
    }

    const input = gatewayAuthCredentialSchema.parse(body);
    const result = await saveGatewayNativeAuthCredential(input);
    const authStatus = await getGatewayNativeAuthStatus();

    return NextResponse.json({
      saved: true,
      result: redactSecrets(result),
      authStatus: redactSecrets(authStatus)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to save the OpenClaw gateway credential.")
      },
      { status: 400 }
    );
  }
}
