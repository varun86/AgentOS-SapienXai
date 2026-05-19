import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ensureTrailingNewline,
  mergeWorkspaceAgentRolesSection,
  renderWorkspaceAgentsMarkdown,
  renderWorkspaceAgentsTeamSection,
  replaceOrInsertMarkdownSection
} from "@/lib/openclaw/domains/workspace-agents-document";
import { readWorkspaceProjectManifest } from "@/lib/openclaw/domains/workspace-manifest";
import { getWorkspaceTemplateMeta } from "@/lib/openclaw/workspace-presets";

export async function syncWorkspaceAgentsMarkdown(workspacePath: string) {
  const manifest = await readWorkspaceProjectManifest(workspacePath);
  const workspaceName = manifest.name ?? path.basename(workspacePath);
  const templateLabel = manifest.template
    ? getWorkspaceTemplateMeta(manifest.template).label
    : "Workspace";
  const sourceMode = manifest.sourceMode ?? "empty";
  const rules = manifest.rules ?? { workspaceOnly: true };
  const nextTeamSection = renderWorkspaceAgentsTeamSection(manifest.agents);
  const agentsPath = path.join(workspacePath, "AGENTS.md");
  let current = "";

  try {
    current = await readFile(agentsPath, "utf8");
  } catch {
    current = renderWorkspaceAgentsMarkdown({
      name: workspaceName,
      templateLabel,
      sourceMode,
      workspaceOnly: Boolean(rules.workspaceOnly),
      agents: manifest.agents
    });
  }

  const withTeam = replaceOrInsertMarkdownSection(current, "Team", nextTeamSection, "Workspace");
  const nextRolesSection = mergeWorkspaceAgentRolesSection(withTeam, manifest.agents);
  const withRoles = replaceOrInsertMarkdownSection(withTeam, "Agent Roles", nextRolesSection, "Team");
  const nextContent = ensureTrailingNewline(withRoles);

  if (nextContent === current) {
    return;
  }

  await mkdir(path.dirname(agentsPath), { recursive: true });
  await writeFile(agentsPath, nextContent, "utf8");
}
