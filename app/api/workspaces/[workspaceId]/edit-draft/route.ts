import { NextResponse } from "next/server";

import { createWorkspaceEditDraft } from "@/lib/agentos/application/workspace-edit-draft";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
    }>;
  }
) {
  try {
    const { workspaceId } = await context.params;
    const result = await createWorkspaceEditDraft(workspaceId);
    return NextResponse.json(redactSecrets(result));
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Unable to create workspace edit draft.")
      },
      { status: 400 }
    );
  }
}
