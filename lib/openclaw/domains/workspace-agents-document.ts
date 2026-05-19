import { formatAgentPresetLabel } from "@/lib/openclaw/agent-presets";
import type { AgentPolicy, WorkspaceSourceMode } from "@/lib/openclaw/types";

export type WorkspaceAgentsMarkdownAgentInput = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  enabled?: boolean | null;
  isPrimary?: boolean | null;
  skillId?: string | null;
  toolIds?: string[] | null;
  modelId?: string | null;
  policy?: AgentPolicy | null;
  channelIds?: string[] | null;
};

export function renderWorkspaceAgentsMarkdown(params: {
  name: string;
  brief?: string;
  templateLabel: string;
  sourceMode: WorkspaceSourceMode;
  workspaceOnly: boolean;
  agents: WorkspaceAgentsMarkdownAgentInput[];
  workspaceSlug?: string | null;
}) {
  return `# ${params.name}

Shared project context for all agents working in this workspace.

## Workspace
- Template: ${params.templateLabel}
- Source mode: ${params.sourceMode}
- Workspace-only access: ${params.workspaceOnly ? "enabled" : "disabled"}

${renderWorkspaceAgentsTeamSection(params.agents, params.workspaceSlug)}

${renderWorkspaceAgentRolesSection(params.agents, params.workspaceSlug)}

## Customize
${params.brief || "Clarify the project goal, definition of done, constraints, and success signals before large changes."}

## Safety defaults
- Stay inside the attached workspace unless the task explicitly requires another location.
- Prefer direct, reviewable changes over speculative rewrites.
- Preserve user work and avoid destructive actions without clear approval.
- Update durable docs when stable architecture, workflow, or product decisions change.
- Worker and browser agents should not install tooling unless their explicit policy allows it.
- Route environment preparation to setup-oriented agents when the work depends on new tooling.

## Daily memory
- Capture durable facts in MEMORY.md and memory/*.md.
- Record stable decisions in memory/decisions.md.
- Keep temporary chatter and scratch notes in memory/.

## Output
- Be concise in chat and write longer output to files when the artifact matters.
- Put task-specific deliverables, drafts, reports, and docs inside per-run folders under deliverables/.
- Avoid writing final artifacts to the workspace root unless explicitly requested.
`;
}

export function renderWorkspaceAgentsTeamSection(
  agents: WorkspaceAgentsMarkdownAgentInput[],
  workspaceSlug?: string | null
) {
  const activeAgents = normalizeAgentInputs(agents, workspaceSlug).filter((agent) => agent.enabled);
  const lines = activeAgents.map((agent) => {
    const labels = [
      agent.isPrimary ? "primary" : null,
      agent.role,
      agent.policy ? formatAgentPresetLabel(agent.policy.preset) : null
    ].filter((value): value is string => Boolean(value));

    return `- ${agent.name} (\`${agent.id}\`)${labels.length > 0 ? ` · ${labels.join(" · ")}` : ""}`;
  });

  return `## Team
${lines.length > 0 ? lines.join("\n") : "- No active agents configured yet."}`;
}

export function renderWorkspaceAgentRolesSection(
  agents: WorkspaceAgentsMarkdownAgentInput[],
  workspaceSlug?: string | null
) {
  const activeAgents = normalizeAgentInputs(agents, workspaceSlug).filter((agent) => agent.enabled);
  const sections = activeAgents.map((agent) => {
    const policy = agent.policy;
    const skills = [agent.skillId].filter((value): value is string => Boolean(value));
    const tools = uniqueStrings([
      ...(agent.toolIds ?? []),
      ...(policy?.fileAccess === "workspace-only" ? ["fs.workspaceOnly"] : [])
    ]);
    const channels = uniqueStrings(agent.channelIds ?? []);

    return [
      `### ${agent.name} (\`${agent.id}\`)`,
      `- Agent id: \`${agent.id}\``,
      `- Runtime rule: when the current OpenClaw agent id is \`${agent.id}\`, use this section as the agent-specific role and persona.`,
      `- Role: ${agent.role || "Agent"}`,
      `- Primary: ${agent.isPrimary ? "yes" : "no"}`,
      ...(policy ? [`- Preset: ${formatAgentPresetLabel(policy.preset)}`] : []),
      ...(agent.modelId ? [`- Model: \`${agent.modelId}\``] : []),
      ...(skills.length > 0 ? [`- Skills: ${skills.map((skill) => `\`${skill}\``).join(", ")}`] : []),
      ...(tools.length > 0 ? [`- Tools: ${tools.map((tool) => `\`${tool}\``).join(", ")}`] : []),
      ...(policy
        ? [
            `- File access: ${policy.fileAccess}`,
            `- Network access: ${policy.networkAccess}`,
            `- Install scope: ${policy.installScope}`,
            `- Missing tools: ${policy.missingToolBehavior}`
          ]
        : []),
      ...(channels.length > 0 ? [`- Channels: ${channels.map((channel) => `\`${channel}\``).join(", ")}`] : [])
    ].join("\n");
  });

  return `## Agent Roles
Each agent should use only the subsection matching its current OpenClaw agent id as its personal role/persona. Other subsections describe teammates in the same workspace.

${sections.length > 0 ? sections.join("\n\n") : "- No active agent role sections are configured yet."}`;
}

function normalizeAgentInputs(
  agents: WorkspaceAgentsMarkdownAgentInput[],
  workspaceSlug?: string | null
) {
  return [...agents]
    .map((agent, index) => {
      const baseId = normalizeOptionalValue(agent.id) ?? slugify(normalizeOptionalValue(agent.name) ?? `agent-${index + 1}`);
      const id = workspaceSlug && !baseId.startsWith(`${workspaceSlug}-`)
        ? `${workspaceSlug}-${slugify(baseId) || "agent"}`
        : baseId;
      const role = normalizeOptionalValue(agent.role);

      return {
        id,
        name: normalizeOptionalValue(agent.name) ?? role ?? id,
        role,
        enabled: agent.enabled !== false,
        isPrimary: Boolean(agent.isPrimary),
        skillId: normalizeOptionalValue(agent.skillId),
        toolIds: uniqueStrings(agent.toolIds ?? []),
        modelId: normalizeOptionalValue(agent.modelId),
        policy: agent.policy ?? null,
        channelIds: uniqueStrings(agent.channelIds ?? [])
      };
    })
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

export function replaceOrInsertMarkdownSection(
  content: string,
  sectionTitle: string,
  nextSection: string,
  insertAfterTitle?: string
) {
  const normalizedSection = nextSection.trim();
  const sectionMatch = findMarkdownSection(content, sectionTitle);

  if (sectionMatch) {
    return [
      content.slice(0, sectionMatch.start).trimEnd(),
      normalizedSection,
      content.slice(sectionMatch.end).trimStart()
    ].filter(Boolean).join("\n\n");
  }

  if (insertAfterTitle) {
    const insertAfterMatch = findMarkdownSection(content, insertAfterTitle);

    if (insertAfterMatch) {
      return [
        content.slice(0, insertAfterMatch.end).trimEnd(),
        normalizedSection,
        content.slice(insertAfterMatch.end).trimStart()
      ].filter(Boolean).join("\n\n");
    }
  }

  return [content.trimEnd(), normalizedSection].filter(Boolean).join("\n\n");
}

function findMarkdownSection(content: string, sectionTitle: string) {
  const heading = new RegExp(`^##\\s+${escapeRegExp(sectionTitle)}\\s*$`, "m");
  const match = heading.exec(content);

  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index;
  const afterHeadingIndex = start + match[0].length;
  const nextHeading = /^##\s+/m.exec(content.slice(afterHeadingIndex));
  const end = nextHeading?.index === undefined
    ? content.length
    : afterHeadingIndex + nextHeading.index;

  return { start, end };
}

function normalizeOptionalValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
