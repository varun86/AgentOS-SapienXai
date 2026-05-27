import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildIntegrationStates,
  summarizeIntegrationStates
} from "@/lib/agentos/integrations/state";
import type { AgentRecord, MissionControlSnapshot } from "@/lib/agentos/contracts";

test("integration state does not fake connected channel status from config alone", () => {
  const snapshot = buildSnapshot({
    channelAccounts: [
      {
        id: "telegram-default",
        type: "telegram",
        name: "Telegram default",
        enabled: true,
        kind: "chat",
        capabilities: ["chat"],
        metadata: { source: "config.channels.default" }
      }
    ],
    channelRegistry: {
      version: 1,
      channels: [
        {
          id: "telegram-default",
          type: "telegram",
          name: "Telegram default",
          primaryAgentId: "agent-1",
          workspaces: [
            {
              workspaceId: "workspace-1",
              workspacePath: "/tmp/workspace",
              agentIds: ["agent-1"],
              groupAssignments: []
            }
          ]
        }
      ]
    },
    agents: [buildAgent({ id: "agent-1", modelId: "openai/gpt-5.4-mini" })]
  });

  const telegram = buildIntegrationStates(snapshot).find((integration) => integration.id === "telegram");

  assert.equal(telegram?.status, "unknown");
  assert.equal(telegram?.linkedAgentCount, 1);
  assert.ok(telegram?.sourceMethods.includes("snapshot.channelAccounts"));
  assert.ok(telegram?.sourceMethods.includes("snapshot.channelRegistry.channels"));
});

test("integration state marks available model providers connected from real model routes", () => {
  const snapshot = buildSnapshot({
    agents: [buildAgent({ id: "agent-1", modelId: "openrouter/meta-llama/llama-3.3" })],
    models: [
      {
        id: "openrouter/meta-llama/llama-3.3",
        name: "Llama 3.3",
        provider: "openrouter",
        input: "text",
        contextWindow: 128000,
        local: false,
        available: true,
        missing: false,
        tags: [],
        usageCount: 2
      }
    ]
  });

  const openrouter = buildIntegrationStates(snapshot).find((integration) => integration.id === "openrouter");
  const summary = summarizeIntegrationStates(buildIntegrationStates(snapshot));

  assert.equal(openrouter?.status, "connected");
  assert.equal(openrouter?.linkedAgentCount, 1);
  assert.equal(summary.connected >= 1, true);
});

test("unsupported integrations stay explicit instead of pretending to be configured", () => {
  const snapshot = buildSnapshot({});
  const github = buildIntegrationStates(snapshot).find((integration) => integration.id === "github");

  assert.equal(github?.status, "unsupported");
  assert.match(github?.connectionHealth.detail ?? "", /No GitHub setup route/);
  assert.equal(github?.linkedAgentCount, 0);
});

function buildSnapshot(overrides: Partial<MissionControlSnapshot>): MissionControlSnapshot {
  return {
    generatedAt: "2026-05-27T00:00:00.000Z",
    mode: "live",
    diagnostics: {
      installed: true,
      loaded: true,
      rpcOk: true,
      health: "healthy",
      workspaceRoot: "/tmp",
      configuredWorkspaceRoot: null,
      dashboardUrl: "http://localhost:3000",
      gatewayUrl: "ws://127.0.0.1:18789",
      configuredGatewayUrl: null,
      openClawBinarySelection: {
        mode: "auto",
        path: null,
        resolvedPath: null,
        label: "OpenClaw",
        detail: "test"
      },
      modelReadiness: {
        ready: true,
        defaultModel: "openai/gpt-5.4-mini",
        resolvedDefaultModel: "openai/gpt-5.4-mini",
        configuredModelCount: 1,
        readyModelCount: 1,
        missingModelCount: 0,
        allowed: ["openai/gpt-5.4-mini"],
        issues: []
      },
      runtime: {
        stateRoot: "/tmp",
        stateWritable: true,
        sessionStoreWritable: true,
        sessionStores: [],
        smokeTest: {
          status: "not-run",
          checkedAt: null,
          agentId: null,
          runId: null,
          summary: null,
          error: null
        },
        issues: []
      },
      securityWarnings: [],
      issues: []
    },
    presence: [],
    channelAccounts: [],
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        path: "/tmp/workspace"
      }
    ],
    agents: [],
    models: [],
    runtimes: [],
    tasks: [],
    relationships: [],
    missionPresets: [],
    channelRegistry: {
      version: 1,
      channels: []
    },
    ...overrides
  } as MissionControlSnapshot;
}

function buildAgent(input: { id: string; modelId: string }): AgentRecord {
  return {
    id: input.id,
    name: input.id,
    workspaceId: "workspace-1",
    workspacePath: "/tmp/workspace",
    modelId: input.modelId,
    isDefault: false,
    status: "ready",
    sessionCount: 0,
    lastActiveAt: null,
    currentAction: "",
    activeRuntimeIds: [],
    heartbeat: {
      enabled: false,
      every: null,
      everyMs: null
    },
    identity: {},
    profile: {
      purpose: null,
      operatingInstructions: [],
      responseStyle: [],
      outputPreference: null,
      sourceFiles: []
    },
    skills: [],
    tools: [],
    policy: {
      preset: "worker",
      missingToolBehavior: "fallback",
      installScope: "workspace",
      fileAccess: "workspace-only",
      networkAccess: "restricted"
    }
  };
}
