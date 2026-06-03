import type { RuntimeCreatedFile, TaskRecord } from "@/lib/openclaw/types";

export type TaskFollowUpAvailability = {
  available: boolean;
  reason: string | null;
};

export type TaskFollowUpPromptInput = {
  task: TaskRecord;
  operatorMessage: string;
  latestResult?: string | null;
  createdFiles?: RuntimeCreatedFile[];
  outputSummary?: string | null;
};

const FOLLOW_UP_LIMIT = 11_600;
const SECTION_LIMITS = {
  operator: 3_000,
  mission: 2_600,
  result: 4_200,
  files: 1_000
};

export function resolveTaskFollowUpAvailability(task: Pick<
  TaskRecord,
  "agentIds" | "dispatchId" | "primaryAgentId" | "sessionIds" | "status"
>): TaskFollowUpAvailability {
  if (!isTaskFollowUpStatus(task.status)) {
    return {
      available: false,
      reason: "Follow-up is available for queued, running, stalled, or completed tasks."
    };
  }

  if (!task.primaryAgentId && task.agentIds.length === 0) {
    return {
      available: false,
      reason: "This task does not expose an OpenClaw agent to continue."
    };
  }

  if (!task.dispatchId && task.sessionIds.length === 0) {
    return {
      available: false,
      reason: "This task does not expose an OpenClaw session or dispatch to continue."
    };
  }

  return {
    available: true,
    reason: null
  };
}

export function buildTaskFollowUpPrompt(input: TaskFollowUpPromptInput) {
  const operatorMessage = limitSection(input.operatorMessage, SECTION_LIMITS.operator);
  const mission = limitSection(resolveOriginalMission(input.task), SECTION_LIMITS.mission);
  const latestResult = limitSection(
    input.latestResult || readTaskMetadataString(input.task, "finalResponseText") ||
      readTaskMetadataString(input.task, "resultPreview") ||
      input.task.subtitle,
    SECTION_LIMITS.result
  );
  const files = limitSection(formatCreatedFiles(input.task, input.createdFiles), SECTION_LIMITS.files);
  const outputSummary = limitSection(input.outputSummary ?? "", SECTION_LIMITS.result);

  return limitSection(
    [
      "Continue this task in the existing task context. Use the current OpenClaw session state and previous result; do not restart unless the operator explicitly asks for a retry.",
      "",
      "Operator follow-up:",
      operatorMessage,
      "",
      "Original mission:",
      mission,
      latestResult ? "" : null,
      latestResult ? "Latest result:" : null,
      latestResult || null,
      outputSummary ? "" : null,
      outputSummary ? "Output context:" : null,
      outputSummary || null,
      files ? "" : null,
      files ? "Existing output/files:" : null,
      files || null
    ]
      .filter((entry): entry is string => typeof entry === "string")
      .join("\n"),
    FOLLOW_UP_LIMIT
  );
}

function isTaskFollowUpStatus(status: string) {
  return status === "queued" || status === "running" || status === "stalled" || status === "completed";
}

function resolveOriginalMission(task: TaskRecord) {
  return task.mission?.trim() || task.title.trim() || "Untitled task";
}

function readTaskMetadataString(task: TaskRecord, key: string) {
  const value = task.metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatCreatedFiles(task: TaskRecord, createdFiles: RuntimeCreatedFile[] | undefined) {
  const entries = (createdFiles ?? [])
    .map((file) => file.displayPath || file.path)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 8);

  if (entries.length > 0) {
    return entries.join("\n");
  }

  if (task.artifactCount > 0) {
    return `${task.artifactCount} file${task.artifactCount === 1 ? "" : "s"} reported by this task.`;
  }

  return "";
}

function limitSection(value: string, maxLength: number) {
  const normalized = value.replace(/\s+\n/g, "\n").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 39, 1)).trimEnd()}\n\n[truncated for task follow-up]`;
}
