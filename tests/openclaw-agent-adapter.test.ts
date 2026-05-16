import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentPayloadsFromConfig,
  buildAgentPayloadsFromGatewayList
} from "@/lib/openclaw/adapter/agent-adapter";

test("agent adapter suppresses legacy native-create duplicates in config fallback", () => {
  const agents = buildAgentPayloadsFromConfig([
    {
      id: "sen-atlas",
      name: "Sen Atlas",
      workspace: "/Users/example/.openclaw/workspace",
      agentDir: "/Users/example/.openclaw/agents/sen-atlas/agent"
    },
    {
      id: "workspace-sen-atlas",
      name: "Sen Atlas",
      workspace: "/Users/example/.openclaw/workspace",
      agentDir: "/Users/example/.openclaw/workspace/.openclaw/agents/workspace-sen-atlas/agent"
    },
    {
      id: "workspace-reviewer",
      name: "Reviewer",
      workspace: "/Users/example/.openclaw/workspace",
      agentDir: "/Users/example/.openclaw/workspace/.openclaw/agents/workspace-reviewer/agent"
    }
  ], "/Users/example/.openclaw");

  assert.deepEqual(agents.map((agent) => agent.id), ["workspace-sen-atlas", "workspace-reviewer"]);
});

test("agent adapter preserves same-name workspace-local agents", () => {
  const agents = buildAgentPayloadsFromConfig([
    {
      id: "workspace-reviewer-a",
      name: "Reviewer",
      workspace: "/Users/example/project",
      agentDir: "/Users/example/project/.openclaw/agents/workspace-reviewer-a/agent"
    },
    {
      id: "workspace-reviewer-b",
      name: "Reviewer",
      workspace: "/Users/example/project",
      agentDir: "/Users/example/project/.openclaw/agents/workspace-reviewer-b/agent"
    }
  ], "/Users/example/.openclaw");

  assert.deepEqual(agents.map((agent) => agent.id), ["workspace-reviewer-a", "workspace-reviewer-b"]);
});

test("agent adapter suppresses legacy native-create duplicates in Gateway list snapshots", () => {
  const agents = buildAgentPayloadsFromGatewayList(
    {
      agents: [
        {
          id: "sen-atlas",
          name: "Sen Atlas",
          workspace: "/Users/example/.openclaw/workspace"
        },
        {
          id: "workspace-sen-atlas",
          name: "Sen Atlas",
          workspace: "/Users/example/.openclaw/workspace"
        }
      ]
    },
    [
      {
        id: "sen-atlas",
        name: "Sen Atlas",
        workspace: "/Users/example/.openclaw/workspace",
        agentDir: "/Users/example/.openclaw/agents/sen-atlas/agent"
      },
      {
        id: "workspace-sen-atlas",
        name: "Sen Atlas",
        workspace: "/Users/example/.openclaw/workspace",
        agentDir: "/Users/example/.openclaw/workspace/.openclaw/agents/workspace-sen-atlas/agent"
      }
    ],
    "/Users/example/.openclaw"
  );

  assert.deepEqual(agents.map((agent) => agent.id), ["workspace-sen-atlas"]);
});
