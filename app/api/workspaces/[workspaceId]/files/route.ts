import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listWorkspaceManagedFiles,
  readWorkspaceManagedFile,
  writeWorkspaceManagedFile
} from "@/lib/openclaw/application/workspace-file-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path")?.trim();

    if (filePath) {
      const file = await readWorkspaceManagedFile({
        workspaceId,
        path: filePath
      });

      return NextResponse.json(file);
    }

    const files = await listWorkspaceManagedFiles(workspaceId);
    return NextResponse.json(files);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to read workspace files."
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const input = fileWriteSchema.parse(await request.json());
    const file = await writeWorkspaceManagedFile({
      workspaceId,
      path: input.path,
      content: input.content
    });

    return NextResponse.json(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save workspace file.";
    const status = message.includes("exceeds") ? 413 : 400;

    return NextResponse.json(
      {
        error: message
      },
      { status }
    );
  }
}
