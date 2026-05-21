import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { setOpenClawAdapterForTesting, type OpenClawAdapter } from "@/lib/openclaw/adapter/openclaw-adapter";
import { mapOpenClawRuntimeSnapshotToRuntimes } from "@/lib/openclaw/application/runtime-state-service";
import { settleSessionsPayloadFromOpenClaw } from "@/lib/openclaw/application/mission-control/payload-loader";
import {
  clearMissionControlRuntimeHistoryStore,
  createMissionControlRuntimeHistoryStore,
  mergeMissionControlRuntimeHistory
} from "@/lib/openclaw/application/mission-control/runtime-reconciliation";
import {
  createMissionControlWorkspaceBindings
} from "@/lib/openclaw/application/mission-control/workspace-hydration";
import type { RuntimeRecord } from "@/lib/openclaw/types";

const tempRoots: string[] = [];

afterEach(async () => {
  setOpenClawAdapterForTesting(null);

  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

test("Gateway sessions.list failure falls back to local session catalogs", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "agentos-session-fallback-"));
  tempRoots.push(workspaceRoot);
  const sessionsPath = path.join(workspaceRoot, ".openclaw", "agents", "agent-1", "sessions");
  await mkdir(sessionsPath, { recursive: true });
  await writeFile(
    path.join(sessionsPath, "sessions.json"),
    JSON.stringify({
      "agent:agent-1:main": {
        sessionId: "session-1",
        updatedAt: 1_700_000_000_000,
        model: "openai/test"
      }
    })
  );

  setOpenClawAdapterForTesting({
    async listSessions() {
      throw new Error("Gateway sessions.list failed");
    }
  } as unknown as OpenClawAdapter);

  const result = await settleSessionsPayloadFromOpenClaw([
    {
      id: "agent-1",
      workspace: workspaceRoot
    }
  ]);

  assert.equal(result.status, "fulfilled");
  const fallbackSession = result.value.sessions.find((session) => session.sessionId === "session-1");
  assert.ok(fallbackSession);
  assert.equal(fallbackSession.agentId, "agent-1");
});

test("runtime history merge preserves ordering, dedupes, and can be cleared", () => {
  const historyStore = createMissionControlRuntimeHistoryStore();
  const older = createRuntimeRecord("runtime-older", 1_700_000_000_000, "running");
  const newer = createRuntimeRecord("runtime-newer", 1_700_000_001_000, "running");

  assert.deepEqual(
    mergeMissionControlRuntimeHistory([older, newer], historyStore).map((runtime) => runtime.id),
    ["runtime-newer", "runtime-older"]
  );

  const refreshedNewer = createRuntimeRecord("runtime-newer", 1_700_000_002_000, "running");
  const merged = mergeMissionControlRuntimeHistory([refreshedNewer], historyStore);

  assert.deepEqual(merged.map((runtime) => runtime.id), ["runtime-newer", "runtime-older"]);
  assert.equal(merged.find((runtime) => runtime.id === "runtime-older")?.status, "completed");
  assert.equal(merged.find((runtime) => runtime.id === "runtime-older")?.metadata.historical, true);

  clearMissionControlRuntimeHistoryStore(historyStore);

  assert.deepEqual(
    mergeMissionControlRuntimeHistory([refreshedNewer], historyStore).map((runtime) => runtime.id),
    ["runtime-newer"]
  );
});

test("runtime snapshot mapper preserves gateway runtime metadata from partial payloads", () => {
  const runtimes = mapOpenClawRuntimeSnapshotToRuntimes(
    {
      runtimes: [{
        id: "runtime-1",
        key: "agent:agent-1:main",
        title: "Gateway runtime",
        subtitle: "Partial snapshot",
        status: "running",
        updatedAt: 1_700_000_000_000,
        agentId: "agent-1",
        metadata: {
          partialFailure: true,
          failedSection: "artifacts"
        }
      }]
    },
    {
      agentConfig: [{ id: "agent-1", workspace: "/tmp/workspace", model: "openai/test" }],
      agentsList: [{ id: "agent-1", workspace: "/tmp/workspace", model: "openai/test" }],
      resolveWorkspaceId: () => "workspace-1"
    }
  );

  assert.equal(runtimes.length, 1);
  assert.equal((runtimes[0].metadata as Record<string, unknown>).partialFailure, true);
  assert.equal((runtimes[0].metadata as Record<string, unknown>).failedSection, "artifacts");
  assert.equal(runtimes[0].metadata.gatewayObjectKind, "runtime");
});

test("workspace bindings keep workspace, agent, and resolver shape stable", () => {
  const bindings = createMissionControlWorkspaceBindings([
    { id: "agent-1", workspace: "/tmp/acme", agentDir: "/tmp/acme/.openclaw/agents/agent-1", model: "openai/test" },
    { id: "agent-2", workspace: "/tmp/acme", agentDir: "/tmp/acme/.openclaw/agents/agent-2", model: "openai/test" },
    { id: "global-agent", workspace: "", agentDir: "/tmp/openclaw/agents/global-agent", model: "openai/test" }
  ]);

  assert.deepEqual(bindings.workspacePaths, ["/tmp/acme"]);
  assert.deepEqual(bindings.activeAgentIdsByWorkspacePath.get("/tmp/acme"), ["agent-1", "agent-2"]);
  assert.equal(bindings.resolveWorkspaceId("/tmp/acme"), "acme");
  assert.deepEqual(bindings.workspaceBoundAgents.map((agent) => agent.id), ["agent-1", "agent-2"]);
});

function createRuntimeRecord(
  id: string,
  updatedAt: number,
  status: RuntimeRecord["status"]
): RuntimeRecord {
  return {
    id,
    source: "turn",
    key: id,
    title: id,
    subtitle: id,
    status,
    updatedAt,
    ageMs: null,
    agentId: "agent-1",
    workspaceId: "workspace-1",
    metadata: {}
  };
}
