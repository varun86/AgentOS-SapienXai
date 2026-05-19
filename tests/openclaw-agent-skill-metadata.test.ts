import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "node:test";
import { test } from "node:test";

import { getAgentPresetMeta } from "@/lib/openclaw/agent-presets";
import {
  pruneUnreferencedGeneratedWorkspaceSkills
} from "@/lib/openclaw/domains/agent-provisioning";
import {
  mergeWorkspaceAgentRolesSection,
  renderWorkspaceAgentRolesSection
} from "@/lib/openclaw/domains/workspace-agents-document";
import { parseWorkspaceProjectManifestAgent } from "@/lib/openclaw/domains/workspace-manifest";
import { renderSkillMarkdown } from "@/lib/openclaw/domains/workspace-bootstrap";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("custom agents start without implicit shared skills", () => {
  assert.deepEqual(getAgentPresetMeta("custom").skillIds, []);
});

test("workspace agent manifest keeps all declared skill ids", () => {
  const parsed = parseWorkspaceProjectManifestAgent({
    id: "cyberpunk3-custom-agent",
    name: "Digital Kazım",
    role: "Custom",
    skillId: "project-researcher",
    skillIds: ["project-researcher", "project-builder", "project-analyst"]
  });

  assert.ok(parsed);
  assert.equal(parsed.skillId, "project-researcher");
  assert.deepEqual(parsed.skillIds, ["project-researcher", "project-builder", "project-analyst"]);
});

test("workspace AGENTS.md role section renders multiple skills", () => {
  const markdown = renderWorkspaceAgentRolesSection([
    {
      id: "cyberpunk3-custom-agent",
      name: "Digital Kazım",
      role: "Custom",
      enabled: true,
      skillIds: ["project-researcher", "project-builder", "project-analyst"]
    }
  ]);

  assert.match(
    markdown,
    /Skills: `project-researcher`, `project-builder`, `project-analyst`/
  );
});

test("workspace AGENTS.md role sync preserves custom agent notes", () => {
  const current = `# Workspace

## Agent Roles
Each agent should use only the subsection matching its current OpenClaw agent id as its personal role/persona. Other subsections describe teammates in the same workspace.

### Old Name (\`cyberpunk3-custom-agent\`)
- Agent id: \`cyberpunk3-custom-agent\`
- Runtime rule: stale
- Role: stale
- Personality: Speak like a patient operator.

Keep answers grounded in the CyberPunk3 workspace.

### Deleted Agent (\`stale-agent\`)
- Agent id: \`stale-agent\`
- Personality: remove me
`;

  const merged = mergeWorkspaceAgentRolesSection(current, [
    {
      id: "cyberpunk3-custom-agent",
      name: "Digital Kazım",
      role: "Custom",
      enabled: true,
      skillIds: ["project-researcher"],
      modelId: "openai/gpt-5.4-mini"
    }
  ]);

  assert.match(merged, /### Digital Kazım \(`cyberpunk3-custom-agent`\)/);
  assert.match(merged, /- Role: Custom/);
  assert.match(merged, /- Model: `openai\/gpt-5\.4-mini`/);
  assert.match(merged, /- Personality: Speak like a patient operator\./);
  assert.match(merged, /Keep answers grounded in the CyberPunk3 workspace\./);
  assert.doesNotMatch(merged, /stale-agent/);
});

test("generated workspace skills are pruned only when unreferenced and unchanged", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agentos-skill-metadata-"));
  tempRoots.push(tempRoot);

  const workspacePath = path.join(tempRoot, "workspace");
  await mkdir(path.join(workspacePath, ".openclaw"), { recursive: true });
  await mkdir(path.join(workspacePath, "skills", "project-builder"), { recursive: true });
  await mkdir(path.join(workspacePath, "skills", "project-analyst"), { recursive: true });
  await writeFile(
    path.join(workspacePath, ".openclaw", "project.json"),
    JSON.stringify(
      {
        agents: [
          {
            id: "builder",
            skillIds: ["project-builder"]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(workspacePath, "skills", "project-builder", "SKILL.md"),
    `${renderSkillMarkdown("project-builder", "Project Builder")}\n`,
    "utf8"
  );
  await writeFile(
    path.join(workspacePath, "skills", "project-analyst", "SKILL.md"),
    `${renderSkillMarkdown("project-analyst", "Project Analyst")}\n`,
    "utf8"
  );

  await pruneUnreferencedGeneratedWorkspaceSkills(workspacePath);

  assert.match(
    await readFile(path.join(workspacePath, "skills", "project-builder", "SKILL.md"), "utf8"),
    /Project Builder/
  );
  await assert.rejects(
    () => readFile(path.join(workspacePath, "skills", "project-analyst", "SKILL.md"), "utf8"),
    /ENOENT/
  );
});
