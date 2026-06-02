import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listOpenClawBrowserProfiles,
  openLoginUrlInOpenClawBrowserProfile,
  startOpenClawBrowserProfile
} from "@/lib/openclaw/application/browser-profile-service";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const browserProfileMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start-profile"),
    profileName: z.string().min(1)
  }),
  z.object({
    action: z.literal("open-login"),
    profileName: z.string().min(1),
    loginUrl: z.string().min(1),
    label: z.string().optional()
  })
]);

export async function GET() {
  try {
    return NextResponse.json(redactSecrets(await listOpenClawBrowserProfiles()));
  } catch (error) {
    return NextResponse.json(
      redactSecrets({
        ok: false,
        generatedAt: new Date().toISOString(),
        source: "openclaw.browser.request",
        profiles: [],
        error: redactErrorMessage(error, "Unable to read OpenClaw browser profiles.")
      }),
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = browserProfileMutationSchema.parse(await request.json());

    if (input.action === "start-profile") {
      return NextResponse.json(redactSecrets(await startOpenClawBrowserProfile({
        profileName: input.profileName
      })));
    }

    return NextResponse.json(redactSecrets(await openLoginUrlInOpenClawBrowserProfile({
      profileName: input.profileName,
      loginUrl: input.loginUrl,
      label: input.label
    })));
  } catch (error) {
    return NextResponse.json(
      redactSecrets({
        ok: false,
        generatedAt: new Date().toISOString(),
        source: "openclaw.browser.request",
        error: redactErrorMessage(error, "Unable to update OpenClaw browser profile.")
      }),
      { status: 400 }
    );
  }
}
