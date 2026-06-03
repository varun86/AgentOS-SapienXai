import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskFollowUpPrompt,
  resolveTaskFollowUpAvailability
} from "@/lib/openclaw/domains/task-follow-up";
import type { TaskRecord } from "@/lib/openclaw/types";

test("task follow-up prompt includes operator message, original mission, and latest result", () => {
  const prompt = buildTaskFollowUpPrompt({
    task: createTaskRecord({
      mission: "Research the release checklist and summarize the blockers.",
      metadata: {
        resultPreview: "The release is blocked by a failing smoke check."
      }
    }),
    operatorMessage: "Now fix the smoke check and rerun validation.",
    latestResult: "The release is blocked by a failing smoke check.",
    createdFiles: [{ path: "/workspace/reports/smoke.md", displayPath: "reports/smoke.md" }]
  });

  assert.match(prompt, /Operator follow-up:\nNow fix the smoke check and rerun validation\./);
  assert.match(prompt, /Original mission:\nResearch the release checklist/);
  assert.match(prompt, /Latest result:\nThe release is blocked by a failing smoke check\./);
  assert.match(prompt, /Existing output\/files:\nreports\/smoke\.md/);
});

test("task follow-up availability allows completed tasks with existing context", () => {
  assert.deepEqual(
    resolveTaskFollowUpAvailability(createTaskRecord({ status: "completed" })),
    { available: true, reason: null }
  );
});

test("task follow-up availability rejects tasks without agent or session context", () => {
  assert.deepEqual(
    resolveTaskFollowUpAvailability(createTaskRecord({
      agentIds: [],
      primaryAgentId: undefined
    })),
    {
      available: false,
      reason: "This task does not expose an OpenClaw agent to continue."
    }
  );

  assert.deepEqual(
    resolveTaskFollowUpAvailability(createTaskRecord({
      dispatchId: undefined,
      sessionIds: []
    })),
    {
      available: false,
      reason: "This task does not expose an OpenClaw session or dispatch to continue."
    }
  );
});

function createTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const { metadata, ...restOverrides } = overrides;

  return {
    id: "task-1",
    key: "dispatch:task-1",
    title: "Release checklist",
    mission: "Review the release checklist.",
    subtitle: "Latest task result.",
    status: "completed",
    updatedAt: Date.now(),
    ageMs: 0,
    workspaceId: "workspace-1",
    primaryAgentId: "agent-1",
    primaryAgentName: "Main",
    primaryRuntimeId: "runtime-1",
    dispatchId: "dispatch-1",
    runtimeIds: ["runtime-1"],
    agentIds: ["agent-1"],
    sessionIds: ["session-1"],
    runIds: ["run-1"],
    runtimeCount: 1,
    updateCount: 1,
    liveRunCount: 0,
    artifactCount: 1,
    warningCount: 0,
    ...restOverrides,
    metadata: {
      ...metadata
    }
  };
}
