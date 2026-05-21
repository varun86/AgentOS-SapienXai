import { NextResponse } from "next/server";
import { z } from "zod";

import { abortMissionTask } from "@/lib/agentos/control-plane";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const abortRequestSchema = z.object({
  reason: z.string().trim().max(512).optional().nullable(),
  dispatchId: z.string().trim().min(1).optional().nullable()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId: rawTaskId } = await context.params;
  const taskId = decodeURIComponent(rawTaskId);

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const parseResult = abortRequestSchema.safeParse(payload);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: redactErrorMessage(parseResult.error, "Invalid task abort request.")
      },
      { status: 400 }
    );
  }

  try {
    const result = await abortMissionTask(taskId, parseResult.data.reason ?? null, parseResult.data.dispatchId ?? null);
    return NextResponse.json(redactSecrets({
      result
    }));
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to abort the task.")
      },
      { status: 400 }
    );
  }
}
