import { NextResponse } from "next/server";

import { discoverTelegramGroups } from "@/lib/agentos/control-plane";
import { createTimingCollector, formatTimingSummary, measureTiming } from "@/lib/openclaw/timing";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const timings = createTimingCollector("workspace-telegram-discovered-groups");

  try {
    await context.params;

    const groups = (await measureTiming(timings, "telegram.discovery", () => discoverTelegramGroups(timings))).map((route) => ({
      chatId: route.routeId,
      title: route.title ?? null,
      lastSeen: route.lastSeen
    }));
    const summary = timings.summary();
    console.info(formatTimingSummary(summary));

    return NextResponse.json(redactSecrets({ groups, timings: summary }));
  } catch (error) {
    const summary = timings.summary();
    console.info(formatTimingSummary(summary));

    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to discover Telegram groups."),
        timings: summary
      },
      { status: 400 }
    );
  }
}
