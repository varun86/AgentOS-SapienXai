import {
  Activity,
  Archive,
  BellRing,
  Bot,
  BrainCircuit,
  Chrome,
  CircleCheck,
  CircleDashed,
  CirclePause,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Database,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  Github,
  Globe2,
  HardDrive,
  Mail,
  MessageCircle,
  Network,
  Puzzle,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  XCircle,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  AgentRecord,
  MissionControlSnapshot,
  ModelRecord,
  SurfaceAccountRecord,
  WorkItemRecord,
  WorkspaceRecord
} from "@/lib/agentos/contracts";
import type { WorkspaceManagedFile } from "@/lib/openclaw/workspace-file-types";
import {
  formatAgentDisplayName,
  formatContextWindow,
  formatRelativeTime,
  formatTokens,
  resolveRelativeTimeReferenceMs
} from "@/lib/openclaw/presenters";
import type { StatusTone } from "@/components/operations/operations-ui";

export type AgentFilter = "all" | "ready" | "running" | "idle" | "needs-approval";
export type TaskFilter = "all" | "queue" | "running" | "approval" | "completed";
export type IntegrationStatus = "connected" | "pending" | "failed" | "disabled";

export type AgentView = {
  id: string;
  name: string;
  purpose: string;
  status: AgentFilter;
  statusLabel: string;
  statusTone: StatusTone;
  modelLabel: string;
  policyLabel: string;
  workspaceName: string;
  toolsCount: number;
  sessionsCount: number;
  lastActiveLabel: string;
  online: boolean;
  icon: LucideIcon;
  iconTone: StatusTone;
  source?: AgentRecord;
};

export type TaskView = {
  id: string;
  title: string;
  status: "queue" | "running" | "approval" | "completed";
  statusLabel: string;
  statusTone: StatusTone;
  agentName: string;
  category: string;
  priority: "Low" | "Medium" | "High";
  progress: number;
  dueLabel: string;
  tokenLabel: string;
  objective: string;
  description: string;
  artifactCount: number;
  warningCount: number;
  source?: WorkItemRecord;
};

export type ModelView = {
  id: string;
  name: string;
  provider: string;
  statusLabel: string;
  statusTone: StatusTone;
  latencyLabel: string;
  contextLabel: string;
  costLabel: string;
  rateLimitLabel: string;
  role: "Primary" | "Fallback" | "Secondary" | "Experimental";
  lastActiveLabel: string;
  capabilities: string[];
  source?: ModelRecord;
};

export type IntegrationView = {
  id: string;
  name: string;
  category: "Communication" | "Productivity" | "Developer Tools" | "Browser / Automation" | "AI / Model Providers";
  status: IntegrationStatus;
  statusLabel: string;
  statusTone: StatusTone;
  lastSyncLabel: string;
  linkedAgents: number;
  description: string;
  icon: LucideIcon;
  iconTone: StatusTone;
  source?: SurfaceAccountRecord;
};

export type FileView = {
  id: string;
  name: string;
  path: string;
  type: string;
  category: string;
  collection: string;
  updatedLabel: string;
  owner: string;
  sizeLabel: string;
  sizeBytes: number | null;
  tags: string[];
  tasks: number;
  icon: LucideIcon;
  iconTone: StatusTone;
  source?: WorkspaceManagedFile;
};

const agentExamples: AgentView[] = [
  {
    id: "example-coincollect-strategist",
    name: "Coincollect Strategist",
    purpose: "Strategic crypto operations and market intelligence.",
    status: "ready",
    statusLabel: "Ready",
    statusTone: "success",
    modelLabel: "GPT-5.4-MINI",
    policyLabel: "Balanced",
    workspaceName: "Coincollect",
    toolsCount: 24,
    sessionsCount: 128,
    lastActiveLabel: "2m ago",
    online: true,
    icon: ShieldCheck,
    iconTone: "warning"
  },
  {
    id: "example-browser-agent",
    name: "Browser Agent",
    purpose: "Autonomous web research, extraction, and monitoring.",
    status: "running",
    statusLabel: "Running",
    statusTone: "info",
    modelLabel: "GPT-5.4-MINI",
    policyLabel: "Autonomous",
    workspaceName: "Coincollect",
    toolsCount: 18,
    sessionsCount: 86,
    lastActiveLabel: "1m ago",
    online: true,
    icon: Globe2,
    iconTone: "info"
  },
  {
    id: "example-campaign-manager",
    name: "Campaign Manager",
    purpose: "Plans, launches, and optimizes marketing campaigns.",
    status: "idle",
    statusLabel: "Idle",
    statusTone: "warning",
    modelLabel: "GPT-4.1",
    policyLabel: "Guided",
    workspaceName: "Coincollect",
    toolsCount: 22,
    sessionsCount: 64,
    lastActiveLabel: "18m ago",
    online: false,
    icon: Network,
    iconTone: "purple"
  },
  {
    id: "example-agent-atlas",
    name: "Agent Atlas",
    purpose: "Orchestrates agents and routes tasks across the system.",
    status: "ready",
    statusLabel: "Ready",
    statusTone: "success",
    modelLabel: "GPT-5.4-MINI",
    policyLabel: "Autonomous",
    workspaceName: "Coincollect",
    toolsCount: 31,
    sessionsCount: 210,
    lastActiveLabel: "3m ago",
    online: true,
    icon: Sparkles,
    iconTone: "info"
  },
  {
    id: "example-support-operator",
    name: "Support Operator",
    purpose: "Handles user inquiries and resolves support tickets.",
    status: "needs-approval",
    statusLabel: "Needs Approval",
    statusTone: "danger",
    modelLabel: "GPT-4.1",
    policyLabel: "Guided",
    workspaceName: "Coincollect",
    toolsCount: 16,
    sessionsCount: 48,
    lastActiveLabel: "45m ago",
    online: true,
    icon: MessageCircle,
    iconTone: "danger"
  },
  {
    id: "example-research-scout",
    name: "Research Scout",
    purpose: "Finds and summarizes insights from across the web.",
    status: "idle",
    statusLabel: "Idle",
    statusTone: "warning",
    modelLabel: "Claude-3.5",
    policyLabel: "Balanced",
    workspaceName: "Coincollect",
    toolsCount: 14,
    sessionsCount: 32,
    lastActiveLabel: "1h ago",
    online: false,
    icon: BrainCircuit,
    iconTone: "purple"
  }
];

const taskExamples: TaskView[] = [
  ["Growth Experiments Q3", "queue", "Campaign Manager", "Research", "Medium", 0, "May 28, 2025 09:00", "850K"],
  ["Market Outlook - May 2025", "running", "Research Scout", "Analysis", "High", 65, "Started 1h 12m ago", "2.1M"],
  ["Audience Research Sync", "running", "Agent Atlas", "Research", "Medium", 40, "Started 45m ago", "650K"],
  ["Community Rewards Audit", "queue", "Support Operator", "Audit", "Low", 0, "May 28, 2025 10:00", "85K"],
  ["Telegram Content Batch", "queue", "Campaign Manager", "Content", "Medium", 0, "May 28, 2025 11:00", "60K"],
  ["Website Monitoring", "queue", "Browser Agent", "Monitoring", "Low", 0, "May 28, 2025 12:30", "45K"],
  ["Tokenomics Model Update", "approval", "Research Scout", "Analysis", "High", 0, "Due May 28, 2025 14:00", "780K"],
  ["Q2 Marketing Report", "approval", "Campaign Manager", "Report", "Medium", 0, "Due May 28, 2025 13:30", "320K"],
  ["Risk Assessment Refresh", "approval", "DeFi Risk Assessment", "Audit", "High", 0, "Due May 28, 2025 15:00", "550K"],
  ["Daily Market Summary", "completed", "Research Scout", "Summary", "Low", 100, "Completed 2h ago", "130K"],
  ["X / Twitter Trend Analysis", "completed", "Agent Atlas", "Trends", "Medium", 100, "Completed 3h ago", "90K"],
  ["Docs Knowledge Update", "completed", "Support Operator", "Docs", "Low", 100, "Completed 5h ago", "70K"]
].map(([title, status, agentName, category, priority, progress, dueLabel, tokenLabel], index) => ({
  id: `example-task-${index + 1}`,
  title: String(title),
  status: status as TaskView["status"],
  statusLabel: status === "approval" ? "Awaiting Approval" : toTitleCase(String(status)),
  statusTone: status === "running" ? "info" : status === "completed" ? "success" : status === "approval" ? "warning" : "muted",
  agentName: String(agentName),
  category: String(category),
  priority: priority as TaskView["priority"],
  progress: Number(progress),
  dueLabel: String(dueLabel),
  tokenLabel: String(tokenLabel),
  objective: "Complete the assigned operational work and keep linked agents in sync.",
  description: "This task represents a planned AgentOS workflow with policy checks, runtime tracking, and generated outputs.",
  artifactCount: index % 3,
  warningCount: status === "approval" ? 1 : 0
}));

const modelExamples: ModelView[] = [
  ["gpt-5.4-mini", "GPT-5.4-MINI", "OpenAI", "Healthy", "218ms", "128K", "$0.15 / $0.60", "10K TPM / 60 RPM", "Primary", "1m ago"],
  ["gpt-4.1", "GPT-4.1", "OpenAI", "Healthy", "271ms", "128K", "$2.00 / $8.00", "6K TPM / 30 RPM", "Fallback", "3m ago"],
  ["claude-3.5-sonnet", "Claude-3.5 Sonnet", "Anthropic", "Healthy", "312ms", "200K", "$3.00 / $15.00", "6K TPM / 30 RPM", "Fallback", "2m ago"],
  ["gemini-2.5-pro", "Gemini 2.5 Pro", "Google", "Healthy", "340ms", "1M", "$1.25 / $5.00", "8K TPM / 50 RPM", "Secondary", "5m ago"],
  ["deepseek-v3", "DeepSeek-V3", "DeepSeek", "Healthy", "286ms", "128K", "$0.27 / $1.10", "8K TPM / 40 RPM", "Secondary", "6m ago"],
  ["openrouter-mixtral-8x22b", "OpenRouter Mixtral 8x22B", "OpenRouter", "Healthy", "512ms", "128K", "$0.35 / $1.40", "5K TPM / 20 RPM", "Experimental", "12m ago"],
  ["ollama-llama-3.1-70b", "Ollama Llama 3.1 70B", "Ollama", "Local", "18ms", "128K", "$0.00 / $0.00", "Unlimited", "Experimental", "-"]
].map(([id, name, provider, statusLabel, latencyLabel, contextLabel, costLabel, rateLimitLabel, role, lastActiveLabel]) => ({
  id,
  name,
  provider,
  statusLabel,
  statusTone: statusLabel === "Local" ? "info" : "success",
  latencyLabel,
  contextLabel,
  costLabel,
  rateLimitLabel,
  role: role as ModelView["role"],
  lastActiveLabel,
  capabilities: ["Reasoning", "Function Calling", "JSON Mode", "Tool Use"]
}));

const integrationCatalog: Array<Omit<IntegrationView, "status" | "statusLabel" | "statusTone" | "lastSyncLabel" | "linkedAgents">> = [
  { id: "telegram", name: "Telegram", category: "Communication", description: "Send and receive messages, manage notifications and alerts via Telegram.", icon: MessageCircle, iconTone: "info" },
  { id: "discord", name: "Discord", category: "Communication", description: "Route workspace channels, discussions, and alert flows through Discord.", icon: MessageCircle, iconTone: "purple" },
  { id: "gmail", name: "Gmail", category: "Communication", description: "Connect email triage, summaries, and reply workflows.", icon: Mail, iconTone: "danger" },
  { id: "slack", name: "Slack", category: "Productivity", description: "Power team alerts, handoffs, and operational notifications.", icon: MessageCircle, iconTone: "success" },
  { id: "notion", name: "Notion", category: "Productivity", description: "Sync knowledge bases, briefs, and planning pages.", icon: FileText, iconTone: "muted" },
  { id: "google-drive", name: "Google Drive", category: "Productivity", description: "Use shared documents and generated outputs as workspace context.", icon: HardDrive, iconTone: "warning" },
  { id: "github", name: "GitHub", category: "Developer Tools", description: "Connect repositories, issues, pull requests, and release automation.", icon: Github, iconTone: "muted" },
  { id: "linear", name: "Linear", category: "Developer Tools", description: "Sync tasks, roadmaps, and delivery queues.", icon: ClipboardList, iconTone: "purple" },
  { id: "chrome", name: "Chrome / Browser Automation", category: "Browser / Automation", description: "Give browser agents controlled web automation access.", icon: Chrome, iconTone: "warning" },
  { id: "webhooks", name: "Webhooks", category: "Browser / Automation", description: "Trigger and receive events from external systems.", icon: Workflow, iconTone: "danger" },
  { id: "x-twitter", name: "X / Twitter", category: "Browser / Automation", description: "Monitor social trends and route campaign signals.", icon: BellRing, iconTone: "muted" },
  { id: "openrouter", name: "OpenRouter", category: "AI / Model Providers", description: "Route agents across broad hosted model catalogs.", icon: Puzzle, iconTone: "muted" },
  { id: "ollama", name: "Ollama", category: "AI / Model Providers", description: "Use local models for private and low-cost background tasks.", icon: Terminal, iconTone: "muted" }
];

const integrationStatusLabels: Record<IntegrationStatus, string> = {
  connected: "Connected",
  pending: "Pending Setup",
  failed: "Failed",
  disabled: "Disabled"
};

const integrationStatusTones: Record<IntegrationStatus, StatusTone> = {
  connected: "success",
  pending: "warning",
  failed: "danger",
  disabled: "muted"
};

export function buildAgentViews(snapshot: MissionControlSnapshot): AgentView[] {
  if (snapshot.agents.length === 0) {
    return agentExamples;
  }

  const referenceMs = resolveRelativeTimeReferenceMs(snapshot.generatedAt);
  const workspaceById = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]));

  return snapshot.agents.map((agent) => {
    const status = mapAgentStatus(agent);
    return {
      id: agent.id,
      name: formatAgentDisplayName(agent),
      purpose: agent.profile.purpose || agent.currentAction || "OpenClaw agent ready for workspace tasks.",
      status,
      statusLabel: status === "needs-approval" ? "Needs Approval" : status === "running" ? "Running" : toTitleCase(status),
      statusTone: statusToneForAgentFilter(status),
      modelLabel: snapshot.models.find((model) => model.id === agent.modelId)?.name || agent.modelId || "Default",
      policyLabel: toTitleCase(agent.policy.preset),
      workspaceName: workspaceById.get(agent.workspaceId)?.name || agent.workspaceId || "Workspace",
      toolsCount: uniqueCount([...(agent.tools || []), ...(agent.observedTools || [])]),
      sessionsCount: agent.sessionCount,
      lastActiveLabel: formatRelativeTime(agent.lastActiveAt, referenceMs),
      online: agent.status !== "offline",
      icon: iconForAgent(agent),
      iconTone: status === "needs-approval" ? "danger" : status === "running" ? "info" : status === "idle" ? "warning" : "success",
      source: agent
    };
  });
}

export function buildTaskViews(snapshot: MissionControlSnapshot): TaskView[] {
  if (snapshot.tasks.length === 0) {
    return taskExamples;
  }

  const referenceMs = resolveRelativeTimeReferenceMs(snapshot.generatedAt);

  return snapshot.tasks.map((task) => {
    const status = mapTaskStatus(task);
    const progress = status === "completed" ? 100 : status === "running" ? Math.min(95, 25 + task.updateCount * 10) : 0;

    return {
      id: task.id,
      title: task.title || task.mission || task.id,
      status,
      statusLabel: status === "approval" ? "Awaiting Approval" : status === "queue" ? "Queued" : toTitleCase(status),
      statusTone: status === "completed" ? "success" : status === "running" ? "info" : status === "approval" ? "warning" : "muted",
      agentName: task.primaryAgentName || "Unassigned",
      category: readMetadataString(task.metadata, ["category", "type", "source"]) || "Mission",
      priority: inferTaskPriority(task),
      progress,
      dueLabel: formatRelativeTime(task.updatedAt, referenceMs),
      tokenLabel: formatTokens(task.tokenUsage?.total),
      objective: task.mission || task.subtitle || "Track and complete this OpenClaw task.",
      description: task.subtitle || task.mission || "OpenClaw task details will appear here as runtime state updates.",
      artifactCount: task.artifactCount,
      warningCount: task.warningCount,
      source: task
    };
  });
}

export function buildModelViews(snapshot: MissionControlSnapshot): ModelView[] {
  if (snapshot.models.length === 0) {
    return modelExamples;
  }

  const defaultModelId = snapshot.diagnostics.modelReadiness.resolvedDefaultModel ?? snapshot.diagnostics.modelReadiness.defaultModel;

  return snapshot.models.map((model, index) => ({
    id: model.id,
    name: model.name || model.id,
    provider: formatProviderName(model.provider),
    statusLabel: model.local ? "Local" : model.missing || model.available === false ? "Unavailable" : "Healthy",
    statusTone: model.missing || model.available === false ? "danger" : model.local ? "info" : "success",
    latencyLabel: model.local ? "18ms" : `${210 + (index % 6) * 47}ms`,
    contextLabel: formatContextWindow(model.contextWindow),
    costLabel: model.local ? "$0.00 / $0.00" : estimateModelCost(model.provider),
    rateLimitLabel: model.local ? "Unlimited" : `${5 + (index % 5)}K TPM / ${20 + (index % 5) * 10} RPM`,
    role: model.id === defaultModelId || model.tags.includes("default") ? "Primary" : index < 3 ? "Fallback" : index < 5 ? "Secondary" : "Experimental",
    lastActiveLabel: model.usageCount > 0 ? `${Math.max(1, model.usageCount)} uses` : "-",
    capabilities: buildModelCapabilities(model),
    source: model
  }));
}

export function buildIntegrationViews(snapshot: MissionControlSnapshot): IntegrationView[] {
  const channelAccountsByType = new Map<string, SurfaceAccountRecord[]>();
  snapshot.channelAccounts.forEach((account) => {
    const key = normalizeIntegrationKey(account.type);
    channelAccountsByType.set(key, [...(channelAccountsByType.get(key) ?? []), account]);
  });

  const registryByType = new Map<string, number>();
  snapshot.channelRegistry.channels.forEach((channel) => {
    const key = normalizeIntegrationKey(channel.type);
    const linkedCount = uniqueCount(channel.workspaces.flatMap((workspace) => workspace.agentIds));
    registryByType.set(key, (registryByType.get(key) ?? 0) + linkedCount);
  });

  return integrationCatalog.map((entry) => {
    const accounts = channelAccountsByType.get(entry.id) ?? channelAccountsByType.get(aliasIntegrationKey(entry.id)) ?? [];
    const source = accounts[0];
    const linkedAgents = registryByType.get(entry.id) ?? registryByType.get(aliasIntegrationKey(entry.id)) ?? 0;
    const connected = Boolean(source?.enabled || linkedAgents > 0);
    const status: IntegrationStatus = connected ? "connected" : entry.id === "webhooks" || entry.id === "openrouter" || entry.id === "ollama" ? "pending" : "disabled";

    return {
      ...entry,
      status,
      statusLabel: integrationStatusLabels[status],
      statusTone: integrationStatusTones[status],
      lastSyncLabel: connected ? "1m ago" : "Not connected",
      linkedAgents,
      source
    };
  });
}

export function buildFileViews(
  files: WorkspaceManagedFile[],
  workspace: WorkspaceRecord | null,
  agents: AgentRecord[]
): FileView[] {
  if (files.length === 0 && workspace) {
    return [
      ...workspace.bootstrap.coreFiles.map((file) => buildSyntheticFile(file.label, "Core Knowledge", "context")),
      ...workspace.bootstrap.optionalFiles.map((file) => buildSyntheticFile(file.label, "Memory", "memory")),
      ...(workspace.bootstrap.contextFiles ?? []).map((file) => buildSyntheticFile(file.label, "Reports", "context"))
    ];
  }

  return files.map((file, index) => {
    const collection = collectionForFile(file);
    const ownerAgent = agents[index % Math.max(1, agents.length)];
    return {
      id: file.path,
      name: file.label,
      path: `/${file.path}`,
      type: languageLabel(file.language),
      category: file.category,
      collection,
      updatedLabel: file.exists ? `${index + 1}h ago` : "Not created",
      owner: ownerAgent ? formatAgentDisplayName(ownerAgent) : "Workspace",
      sizeLabel: file.size == null ? "-" : formatBytes(file.size),
      sizeBytes: file.size,
      tags: tagFile(file),
      tasks: (index % 8) + 1,
      icon: iconForFile(file.path, file.language),
      iconTone: toneForFile(file),
      source: file
    };
  });
}

export function summarizeTokens(snapshot: MissionControlSnapshot) {
  return snapshot.runtimes.reduce((total, runtime) => total + (runtime.tokenUsage?.total ?? 0), 0);
}

export function formatBigNumber(value: number) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return String(value);
}

export function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${value} B`;
}

export function statusToneForAgentFilter(status: AgentFilter): StatusTone {
  if (status === "ready") {
    return "success";
  }

  if (status === "running") {
    return "info";
  }

  if (status === "needs-approval") {
    return "danger";
  }

  if (status === "idle") {
    return "warning";
  }

  return "muted";
}

function mapAgentStatus(agent: AgentRecord): AgentFilter {
  const metadataNeedsApproval =
    agent.currentAction.toLowerCase().includes("approval") ||
    agent.status === "standby" && agent.activeRuntimeIds.length === 0 && agent.heartbeat.enabled;

  if (metadataNeedsApproval) {
    return "needs-approval";
  }

  if (agent.activeRuntimeIds.length > 0 || agent.status === "engaged" || agent.status === "monitoring") {
    return "running";
  }

  if (agent.status === "ready") {
    return "ready";
  }

  return "idle";
}

function mapTaskStatus(task: WorkItemRecord): TaskView["status"] {
  if (task.warningCount > 0 && task.status !== "completed") {
    return "approval";
  }

  if (task.status === "running") {
    return "running";
  }

  if (task.status === "queued" || task.status === "idle") {
    return "queue";
  }

  if (task.status === "completed") {
    return "completed";
  }

  if (task.status === "stalled") {
    return "approval";
  }

  return "queue";
}

function inferTaskPriority(task: WorkItemRecord): TaskView["priority"] {
  const raw = readMetadataString(task.metadata, ["priority"]);
  if (raw && /high/i.test(raw)) {
    return "High";
  }

  if (raw && /low/i.test(raw)) {
    return "Low";
  }

  if (task.warningCount > 0 || task.liveRunCount > 1) {
    return "High";
  }

  return task.runtimeCount > 1 ? "Medium" : "Low";
}

function iconForAgent(agent: AgentRecord): LucideIcon {
  if (agent.policy.preset === "browser" || /browser|web/i.test(agent.name)) {
    return Globe2;
  }

  if (agent.policy.preset === "monitoring") {
    return Activity;
  }

  if (agent.policy.preset === "setup") {
    return Code2;
  }

  return Bot;
}

function readMetadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function formatProviderName(value: string) {
  if (!value) {
    return "Unknown";
  }

  if (value === "openai") {
    return "OpenAI";
  }

  if (value === "openrouter") {
    return "OpenRouter";
  }

  return toTitleCase(value.replace(/[-_]/g, " "));
}

function estimateModelCost(provider: string) {
  switch (provider) {
    case "openai":
      return "$0.15 / $0.60";
    case "anthropic":
      return "$3.00 / $15.00";
    case "google":
      return "$1.25 / $5.00";
    case "deepseek":
      return "$0.27 / $1.10";
    default:
      return "$0.35 / $1.40";
  }
}

function buildModelCapabilities(model: ModelRecord) {
  const base = ["Reasoning", "JSON Mode"];

  if (model.input.includes("image")) {
    base.push("Vision");
  }

  if (!model.local) {
    base.push("Function Calling", "Tool Use");
  }

  if (model.tags.length > 0) {
    base.push(...model.tags.slice(0, 2).map(toTitleCase));
  }

  return Array.from(new Set(base));
}

function normalizeIntegrationKey(value: string) {
  const normalized = value.toLowerCase().replace(/_/g, "-");
  if (normalized === "email") {
    return "gmail";
  }

  if (normalized === "browser") {
    return "chrome";
  }

  if (normalized === "x" || normalized === "twitter") {
    return "x-twitter";
  }

  return normalized;
}

function aliasIntegrationKey(value: string) {
  if (value === "google-drive") {
    return "drive";
  }

  if (value === "x-twitter") {
    return "twitter";
  }

  return value;
}

function buildSyntheticFile(name: string, collection: string, category: string): FileView {
  return {
    id: `synthetic-${name}`,
    name,
    path: `/${name}`,
    type: name.endsWith(".json") ? "JSON" : "Markdown",
    category,
    collection,
    updatedLabel: "From workspace manifest",
    owner: "Workspace",
    sizeLabel: "-",
    sizeBytes: null,
    tags: [collection.toLowerCase().split(" ")[0]],
    tasks: 0,
    icon: name.endsWith(".json") ? FileJson : FileText,
    iconTone: collection === "Memory" ? "purple" : "info"
  };
}

function collectionForFile(file: WorkspaceManagedFile) {
  if (file.category === "memory") {
    return "Memory";
  }

  if (file.category === "context" || file.category === "identity" || file.category === "tools" || file.category === "boot") {
    return "Core Knowledge";
  }

  if (file.category === "project-config" || file.category === "agent-policy-config") {
    return "Core Knowledge";
  }

  if (file.category === "skills") {
    return "Generated Outputs";
  }

  return "All Files";
}

function languageLabel(language: WorkspaceManagedFile["language"]) {
  return language === "json" ? "JSON" : "Markdown";
}

function iconForFile(filePath: string, language: WorkspaceManagedFile["language"]): LucideIcon {
  if (filePath.endsWith(".json")) {
    return FileJson;
  }

  if (filePath.endsWith(".csv")) {
    return FileSpreadsheet;
  }

  if (filePath.endsWith(".zip")) {
    return FileArchive;
  }

  if (filePath.endsWith("/")) {
    return Folder;
  }

  return language === "json" ? FileJson : FileText;
}

function toneForFile(file: WorkspaceManagedFile): StatusTone {
  if (!file.exists) {
    return "muted";
  }

  if (file.category === "memory") {
    return "purple";
  }

  if (file.category === "project-config" || file.category === "agent-policy-config") {
    return "warning";
  }

  return "info";
}

function tagFile(file: WorkspaceManagedFile) {
  const tags = [file.category.replace("-config", ""), file.source];
  if (!file.editable) {
    tags.push("read-only");
  }

  return tags.slice(0, 3);
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export const agentStatusIcons: Record<AgentFilter, LucideIcon> = {
  all: Bot,
  ready: CircleCheck,
  running: Activity,
  idle: CirclePause,
  "needs-approval": ShieldCheck
};

export const taskStatusIcons: Record<TaskView["status"], LucideIcon> = {
  queue: CircleDashed,
  running: Zap,
  approval: ClipboardCheck,
  completed: CircleCheck
};

export const integrationStatusIcons: Record<IntegrationStatus, LucideIcon> = {
  connected: CircleCheck,
  pending: CircleDashed,
  failed: XCircle,
  disabled: Archive
};

export const fileCollectionIcons: Record<string, LucideIcon> = {
  "All Files": Folder,
  "Core Knowledge": FileText,
  Memory: BrainCircuit,
  "Generated Outputs": Sparkles,
  Reports: ClipboardList,
  Screenshots: HardDrive,
  Datasets: Database,
  Campaigns: BellRing,
  Archived: Archive,
  Trash: XCircle
};
