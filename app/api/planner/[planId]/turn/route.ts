import { NextResponse } from "next/server";
import { z } from "zod";

import { submitWorkspacePlanTurn } from "@/lib/agentos/planner";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const turnSchema = z.object({
  message: z.string().min(1),
  plan: z.any().optional()
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      planId: string;
    }>;
  }
) {
  try {
    const { planId } = await context.params;
    const input = turnSchema.parse(await request.json());
    const result = await submitWorkspacePlanTurn(planId, input.message, input.plan);
    return NextResponse.json(redactSecrets(result));
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to process planner turn.")
      },
      { status: 400 }
    );
  }
}
