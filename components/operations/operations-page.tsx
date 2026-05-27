"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BellRing,
  Bot,
  BrainCircuit,
  Check,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  ClipboardList,
  Database,
  FileInput,
  FilePlus2,
  FileText,
  Filter,
  Folder,
  Gauge,
  HardDrive,
  Import,
  Layers3,
  ListFilter,
  MessageSquare,
  Pause,
  Play,
  Plug,
  Plus,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  Star,
  Upload,
  Workflow,
  X
} from "lucide-react";

import { AddModelsDialog } from "@/components/mission-control/add-models/add-models-dialog";
import { WorkspaceChannelsDialog } from "@/components/mission-control/workspace-channels-dialog";
import { OperationsShell } from "@/components/operations/operations-shell";
import {
  EmptyState,
  EntityIcon,
  FilterChip,
  InspectorPanelFrame,
  KeyValue,
  MiniBadge,
  MoreButton,
  PageHeader,
  ProgressBar,
  SearchToolbar,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
  ToolbarButton,
  ViewToggle,
  pageSurface
} from "@/components/operations/operations-ui";
import {
  buildAgentViews,
  buildFileViews,
  buildIntegrationViews,
  buildModelViews,
  buildTaskViews,
  fileCollectionIcons,
  formatBigNumber,
  formatBytes,
  integrationStatusIcons,
  statusToneForAgentFilter,
  summarizeTokens,
  taskStatusIcons,
  type AgentFilter,
  type AgentView,
  type FileView,
  type IntegrationStatus,
  type IntegrationView,
  type ModelView,
  type TaskView
} from "@/components/operations/operations-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { AddModelsProviderId, MissionControlSnapshot } from "@/lib/agentos/contracts";
import type {
  WorkspaceManagedFile,
  WorkspaceManagedFileListResponse
} from "@/lib/openclaw/workspace-file-types";
import { cn } from "@/lib/utils";

export type OperationsPageId = "agents" | "tasks" | "files" | "models" | "integrations";

export function OperationsPage({
  initialSnapshot,
  page
}: {
  initialSnapshot: MissionControlSnapshot;
  page: OperationsPageId;
}) {
  return (
    <OperationsShell initialSnapshot={initialSnapshot}>
      {(context) => {
        if (page === "agents") {
          return <AgentsPageContent snapshot={context.snapshot} activeWorkspaceId={context.activeWorkspaceId} />;
        }

        if (page === "tasks") {
          return (
            <TasksPageContent
              snapshot={context.snapshot}
              activeWorkspaceId={context.activeWorkspaceId}
              refresh={context.refresh}
            />
          );
        }

        if (page === "files") {
          return (
            <FilesPageContent
              snapshot={context.snapshot}
              activeWorkspaceId={context.activeWorkspaceId}
            />
          );
        }

        if (page === "models") {
          return <ModelsPageContent snapshot={context.snapshot} activeWorkspaceId={context.activeWorkspaceId} />;
        }

        return (
          <IntegrationsPageContent
            snapshot={context.snapshot}
            rootSnapshot={context.rootSnapshot}
            activeWorkspaceId={context.activeWorkspaceId}
            refresh={context.refresh}
            setSnapshot={context.setSnapshot}
          />
        );
      }}
    </OperationsShell>
  );
}

function AgentsPageContent({
  snapshot,
  activeWorkspaceId
}: {
  snapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
}) {
  const agents = useMemo(
    () => buildAgentViews(snapshot, { useExamples: !activeWorkspaceId }),
    [activeWorkspaceId, snapshot]
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? "");
  const [followedIds, setFollowedIds] = useState<string[]>([]);

  const filteredAgents = agents.filter((agent) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [agent.name, agent.purpose, agent.modelLabel, agent.policyLabel, agent.workspaceName]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesFilter = filter === "all" || agent.status === filter;
    return matchesSearch && matchesFilter;
  });
  const selectedAgent = agents.find((agent) => agent.id === selectedId) ?? filteredAgents[0] ?? agents[0] ?? null;
  const runningCount = agents.filter((agent) => agent.status === "running").length;
  const readyCount = agents.filter((agent) => agent.status === "ready").length;
  const idleCount = agents.filter((agent) => agent.status === "idle").length;
  const approvalCount = agents.filter((agent) => agent.status === "needs-approval").length;
  const tokenTotal = summarizeTokens(snapshot);
  const filterCounts: Record<AgentFilter, number> = {
    all: agents.length,
    ready: readyCount,
    running: runningCount,
    idle: idleCount,
    "needs-approval": approvalCount
  };

  return (
    <OperationsPageLayout
      main={
        <>
          <PageHeader
            title="Agents"
            subtitle="Manage your AI workforce. Monitor health, configure capabilities, and run agents at scale."
            secondaryAction={{ label: "Import Agent", icon: Import, onClick: () => toast.message("Agent import is not exposed by OpenClaw yet.") }}
            primaryAction={{ label: "Create Agent", icon: Plus, onClick: () => toast.message("Use Mission Control to create an OpenClaw agent.") }}
          />

          <StatGrid columns={5}>
            <StatCard label="Total Agents" value={String(agents.length)} detail={`${snapshot.workspaces.length} workspaces`} icon={Bot} tone="info" />
            <StatCard label="Active" value={String(runningCount)} detail={`${Math.round((runningCount / Math.max(1, agents.length)) * 100)}% of total`} icon={Activity} tone="success" />
            <StatCard label="Idle" value={String(idleCount)} detail={`${Math.round((idleCount / Math.max(1, agents.length)) * 100)}% of total`} icon={Clock3} tone="warning" />
            <StatCard label="Needs Approval" value={String(approvalCount)} detail={`${Math.round((approvalCount / Math.max(1, agents.length)) * 100)}% of total`} icon={ShieldCheck} tone="danger" />
            <StatCard label="Tokens (7D)" value={formatBigNumber(tokenTotal || 4_200_000)} detail={tokenTotal ? "From live runtimes" : "Waiting for runtime usage"} icon={Sparkles} tone="purple" />
          </StatGrid>

          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search agents..."
            right={<ViewToggle value={view} onChange={setView} />}
          >
            <ToolbarButton icon={Filter} label="Filter" />
            <ToolbarButton icon={SlidersHorizontal} label="Sort: Last active" chevron />
          </SearchToolbar>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "ready", "running", "idle", "needs-approval"] as AgentFilter[]).map((id) => (
              <FilterChip
                key={id}
                label={agentFilterLabel(id)}
                count={filterCounts[id]}
                active={filter === id}
                tone={statusToneForAgentFilter(id)}
                onClick={() => setFilter(id)}
              />
            ))}
          </div>

          {filteredAgents.length > 0 ? (
            <div className={cn(view === "grid" ? "grid gap-2.5 lg:grid-cols-2 min-[1400px]:grid-cols-3" : "flex flex-col gap-2.5")}>
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  list={view === "list"}
                  followed={followedIds.includes(agent.id)}
                  onSelect={() => setSelectedId(agent.id)}
                  onFollow={() =>
                    setFollowedIds((current) =>
                      current.includes(agent.id)
                        ? current.filter((id) => id !== agent.id)
                        : [...current, agent.id]
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No agents match your filters" description="Clear search or switch back to All to see every OpenClaw agent in this workspace." />
          )}

          <RecentAgentActivity snapshot={snapshot} agents={agents} />
        </>
      }
      inspector={selectedAgent ? <AgentInspector agent={selectedAgent} followed={followedIds.includes(selectedAgent.id)} /> : null}
    />
  );
}

function AgentCard({
  agent,
  selected,
  list,
  followed,
  onSelect,
  onFollow
}: {
  agent: AgentView;
  selected: boolean;
  list: boolean;
  followed: boolean;
  onSelect: () => void;
  onFollow: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group rounded-[12px] border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        pageSurface,
        selected && "border-blue-400/70 bg-blue-500/[0.08] shadow-[0_0_0_1px_rgba(59,130,246,0.22),0_22px_64px_rgba(37,99,235,0.16)]"
      )}
    >
      <div className={cn("flex gap-3", list ? "items-center" : "items-start")}>
        <EntityIcon icon={agent.icon} label={agent.name} tone={agent.iconTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <StatusBadge label={agent.statusLabel} tone={agent.statusTone} />
              <h3 className="mt-1.5 truncate text-[0.88rem] font-semibold text-white">{agent.name}</h3>
              <p className="mt-1 line-clamp-2 text-[0.72rem] leading-4 text-slate-300">{agent.purpose}</p>
            </div>
            {selected ? <CircleCheck className="h-4 w-4 shrink-0 text-blue-300" /> : null}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <MiniBadge>{agent.modelLabel}</MiniBadge>
            <MiniBadge>Policy: {agent.policyLabel}</MiniBadge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-2.5 text-[0.58rem] uppercase tracking-[0.11em] text-slate-500">
            <span>Tools <b className="ml-1 text-slate-200">{agent.toolsCount}</b></span>
            <span>Sessions <b className="ml-1 text-slate-200">{agent.sessionsCount}</b></span>
            <span>Last active <b className="ml-1 normal-case tracking-normal text-slate-200">{agent.lastActiveLabel}</b></span>
          </div>
          <div className="mt-2.5 grid grid-cols-[1fr_1fr_auto] gap-2">
            <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={(event) => { event.stopPropagation(); toast.message(`Messaging ${agent.name} opens from Mission Control chat.`); }}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Message
            </Button>
            <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={(event) => { event.stopPropagation(); toast.message(`Task creation for ${agent.name} is ready for a Mission Control handoff.`); }}>
              <Play className="mr-1.5 h-3.5 w-3.5" /> Run Task
            </Button>
            <Button variant={followed ? "default" : "secondary"} size="sm" className="h-8 rounded-[9px] px-2.5" onClick={(event) => { event.stopPropagation(); onFollow(); }}>
              <Star className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentInspector({ agent, followed }: { agent: AgentView; followed: boolean }) {
  return (
    <InspectorPanelFrame>
      <div className="flex items-start gap-3">
        <EntityIcon icon={agent.icon} label={agent.name} tone={agent.iconTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold leading-tight text-white">{agent.name}</h2>
            <MoreButton />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge label={agent.statusLabel} tone={agent.statusTone} />
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <span className={cn("h-1.5 w-1.5 rounded-full", agent.online ? "bg-emerald-400" : "bg-slate-500")} />
              {agent.online ? "Online" : "Offline"}
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-5 text-slate-300">{agent.purpose}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message(`Messaging ${agent.name} opens from Mission Control chat.`)}>Message</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("Run Task will use the existing mission dispatch flow once a task brief is supplied.")}>Run Task</Button>
        <Button size="sm" className="h-8 rounded-[9px] bg-amber-400 px-2 text-xs text-slate-950 hover:bg-amber-300" onClick={() => toast.message(followed ? "Agent already followed." : "Follow state is local to this page.")}>Follow</Button>
      </div>

      <div className="mt-4 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3">
        <KeyValue label="Role" value={agent.policyLabel === "Browser" ? "Browser Operations Agent" : "Strategic Operations Agent"} />
        <KeyValue label="Policy Mode" value={agent.policyLabel} action={<button className="text-blue-300">Manage</button>} />
        <KeyValue label="Workspace Scope" value={`${agent.workspaceName} (Full Access)`} />
        <KeyValue label="Default Model" value={agent.modelLabel} action={<button className="text-blue-300">Change</button>} />
        <KeyValue label="Tools Enabled" value={`${agent.toolsCount} tools`} action={<button className="text-blue-300">Manage</button>} />
      </div>

      <SectionCard title="Runtime Summary" className="mt-3">
        <div className="px-3 py-2 text-xs">
          <KeyValue label="Sessions (7D)" value={<span>{agent.sessionsCount} <span className="ml-2 text-emerald-300">+12%</span></span>} />
          <KeyValue label="Tasks Completed (7D)" value={<span>{Math.max(1, Math.round(agent.sessionsCount * 0.72))} <span className="ml-2 text-emerald-300">+9%</span></span>} />
          <KeyValue label="Success Rate" value="98.3%" />
          <KeyValue label="Avg. Response Time" value="4.2s" />
          <KeyValue label="Tokens Used (7D)" value="1.24M" />
        </div>
      </SectionCard>

      <SectionCard title="Recent Sessions" className="mt-3" action={<button className="text-[0.68rem] text-blue-300">View all</button>}>
        <div className="divide-y divide-white/[0.07] px-3">
          {["Market Outlook - May 2025", "Liquid Staking Report", "DeFi Risk Assessment"].map((title, index) => (
            <div key={title} className="flex items-center justify-between gap-2 py-2.5 text-xs">
              <span className="truncate text-slate-100">{title}</span>
              <span className="shrink-0 text-[0.68rem] text-slate-500">{index === 0 ? "2m ago" : index === 1 ? "18m ago" : "1h ago"}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </InspectorPanelFrame>
  );
}

function RecentAgentActivity({ snapshot, agents }: { snapshot: MissionControlSnapshot; agents: AgentView[] }) {
  const rows = snapshot.runtimes.slice(0, 4).map((runtime) => {
    const agent = agents.find((entry) => entry.id === runtime.agentId);
    return {
      agent: agent?.name || runtime.agentId || "OpenClaw",
      event: runtime.status === "completed" ? "Completed task" : runtime.status === "running" ? "Running task" : "Updated session",
      status: runtime.status,
      task: runtime.title || runtime.subtitle || runtime.id,
      time: runtime.updatedAt ? "recently" : "no activity"
    };
  });
  const displayRows = rows.length > 0 ? rows : [
    { agent: "Browser Agent", event: "Completed task", status: "completed", task: "Competitive landscape scan", time: "1m ago" },
    { agent: "Coincollect Strategist", event: "Created report", status: "completed", task: "Market Outlook - May 2025", time: "3m ago" },
    { agent: "Campaign Manager", event: "Launched campaign", status: "completed", task: "Q2 Web3 Growth Push", time: "8h ago" },
    { agent: "Support Operator", event: "Awaiting approval", status: "queued", task: "Refund request - #12874", time: "45m ago" }
  ];

  return (
    <SectionCard title="Recent Activity" action={<button className="text-xs text-blue-300">View all activity</button>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="border-b border-white/[0.07] text-[0.58rem] uppercase tracking-[0.14em] text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Agent</th>
              <th className="px-3 py-2.5 font-semibold">Event</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Task</th>
              <th className="px-3 py-2.5 font-semibold">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-slate-300">
            {displayRows.map((row, index) => (
              <tr key={`${row.agent}-${row.task}-${index}`} className="hover:bg-white/[0.025]">
                <td className="px-3 py-2.5 text-white">{row.agent}</td>
                <td className="px-3 py-2.5">{row.event}</td>
                <td className="px-3 py-2.5"><StatusBadge label={row.status} tone={row.status === "completed" ? "success" : row.status === "running" ? "info" : "warning"} /></td>
                <td className="px-3 py-2.5">{row.task}</td>
                <td className="px-3 py-2.5">{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TasksPageContent({
  snapshot,
  activeWorkspaceId,
  refresh
}: {
  snapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
  refresh: () => Promise<void>;
}) {
  const tasks = useMemo(
    () => buildTaskViews(snapshot, { useExamples: !activeWorkspaceId }),
    [activeWorkspaceId, snapshot]
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | TaskView["status"]>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedId, setSelectedId] = useState(tasks[0]?.id ?? "");
  const [automationState, setAutomationState] = useState<Record<string, boolean>>({
    "Auto-approve low risk tasks": true,
    "Retry failed tasks (3 attempts)": true,
    "Notify on approval requests": true,
    "Archive completed tasks (30d)": true
  });

  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [task.title, task.agentName, task.category, task.objective, task.description].join(" ").toLowerCase().includes(query);
    const matchesFilter = filter === "all" || task.status === filter;
    return matchesSearch && matchesFilter;
  });
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? tasks[0] ?? null;
  const statusCounts = {
    queue: tasks.filter((task) => task.status === "queue").length,
    running: tasks.filter((task) => task.status === "running").length,
    approval: tasks.filter((task) => task.status === "approval").length,
    completed: tasks.filter((task) => task.status === "completed").length
  };
  const tokenTotal = snapshot.tasks.reduce((sum, task) => sum + (task.tokenUsage?.total ?? 0), 0) || summarizeTokens(snapshot);

  const abortTask = async (task: TaskView) => {
    if (!task.source) {
      toast.message("Cancel is local for sample tasks.");
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.source.id)}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Cancelled from Tasks page.",
          dispatchId: task.source.dispatchId ?? null
        })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Unable to cancel task.");
      }
      toast.success("Task cancellation requested.");
      await refresh();
    } catch (error) {
      toast.error("Task cancellation failed.", {
        description: error instanceof Error ? error.message : "Unknown task error."
      });
    }
  };

  return (
    <OperationsPageLayout
      main={
        <>
          <PageHeader
            title="Tasks"
            subtitle="Plan, monitor, and execute work across your agents. Track progress and manage approvals."
            secondaryAction={{ label: "Import Tasks", icon: FileInput, onClick: () => toast.message("Task import is not available yet.") }}
            primaryAction={{ label: "Create Task", icon: Plus, onClick: () => toast.message("Task creation uses Mission Control mission dispatch.") }}
          />

          <StatGrid columns={4}>
            <StatCard label="Total Tasks" value={String(tasks.length)} detail={`${snapshot.tasks.length || tasks.length} tracked`} icon={ClipboardList} tone="info" />
            <StatCard label="Running" value={String(statusCounts.running)} detail="+2 vs last 7d" icon={Activity} tone="success" />
            <StatCard label="Queued" value={String(statusCounts.queue)} detail="-3 vs last 7d" icon={Clock3} tone="warning" />
            <StatCard label="Needs Approval" value={String(statusCounts.approval)} detail="+1 vs last 7d" icon={ShieldCheck} tone="danger" />
            <StatCard label="Completed Today" value={String(statusCounts.completed)} detail="+29% vs yesterday" icon={CircleCheck} tone="purple" />
            <StatCard label="Token Spend (7D)" value={formatBigNumber(tokenTotal || 4_200_000)} detail={tokenTotal ? "From live task usage" : "+18% vs last 7d"} icon={Sparkles} tone="purple" />
          </StatGrid>

          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks..."
            right={<ViewToggle value={view === "board" ? "board" : "list"} labels={["Board", "List"]} onChange={(value) => setView(value === "grid" ? "board" : "list")} />}
          >
            <ToolbarButton icon={Filter} label="Filter" />
            <ToolbarButton icon={SlidersHorizontal} label="Sort: Due date" chevron />
            <ToolbarButton icon={Layers3} label="Group: Status" chevron active />
          </SearchToolbar>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "queue", "running", "approval", "completed"] as Array<"all" | TaskView["status"]>).map((id) => (
              <FilterChip
                key={id}
                label={id === "all" ? "All" : id === "approval" ? "Awaiting Approval" : toTitleCase(id)}
                count={id === "all" ? tasks.length : statusCounts[id]}
                active={filter === id}
                tone={id === "running" ? "info" : id === "completed" ? "success" : id === "approval" ? "warning" : "muted"}
                onClick={() => setFilter(id)}
              />
            ))}
          </div>

          {view === "board" ? (
            <div className="grid gap-2.5 xl:grid-cols-4">
              {(["queue", "running", "approval", "completed"] as TaskView["status"][]).map((status) => (
                <TaskColumn
                  key={status}
                  status={status}
                  tasks={filteredTasks.filter((task) => task.status === status)}
                  selectedId={selectedTask?.id}
                  onSelect={setSelectedId}
                  onAbort={abortTask}
                />
              ))}
            </div>
          ) : (
            <SectionCard>
              <div className="divide-y divide-white/[0.07]">
                {filteredTasks.map((task) => (
                  <TaskListRow key={task.id} task={task} selected={task.id === selectedTask?.id} onSelect={() => setSelectedId(task.id)} onAbort={() => abortTask(task)} />
                ))}
              </div>
            </SectionCard>
          )}

          <div className="grid gap-2.5 xl:grid-cols-3">
            <RecentTasksPanel tasks={tasks.slice(0, 5)} />
            <ScheduledTasksPanel tasks={tasks.slice(0, 4)} />
            <AutomationsPanel state={automationState} onChange={setAutomationState} />
          </div>
        </>
      }
      inspector={selectedTask ? <TaskInspector task={selectedTask} onAbort={() => abortTask(selectedTask)} /> : null}
    />
  );
}

function TaskColumn({
  status,
  tasks,
  selectedId,
  onSelect,
  onAbort
}: {
  status: TaskView["status"];
  tasks: TaskView[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAbort: (task: TaskView) => void;
}) {
  const Icon = taskStatusIcons[status];
  return (
    <section className={cn("rounded-[12px] p-2.5", pageSurface)}>
      <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-blue-300" />
          <h2 className="text-[0.66rem] font-bold uppercase tracking-[0.13em] text-blue-200">
            {status === "queue" ? "Queue" : status === "approval" ? "Awaiting Approval" : toTitleCase(status)}
          </h2>
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[0.62rem] text-slate-400">{tasks.length}</span>
        </div>
        <button className="text-slate-500 hover:text-white" type="button" onClick={() => toast.message("Add Task opens Mission Control dispatch.")}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} selected={task.id === selectedId} onSelect={() => onSelect(task.id)} onAbort={() => onAbort(task)} />
        ))}
        <button
          type="button"
          onClick={() => toast.message("Add Task opens Mission Control dispatch.")}
          className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs text-blue-300 hover:bg-white/[0.06]"
        >
          <Plus className="mr-1.5 inline h-3.5 w-3.5" /> Add Task
        </button>
      </div>
    </section>
  );
}

function TaskCard({
  task,
  selected,
  onSelect,
  onAbort
}: {
  task: TaskView;
  selected: boolean;
  onSelect: () => void;
  onAbort: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-[10px] border bg-white/[0.035] p-2.5 text-left transition-all hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        selected ? "border-blue-400/70 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]" : "border-white/[0.08]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-xs font-semibold text-white">{task.title}</h3>
          <p className="mt-1 truncate text-[0.68rem] text-slate-400">{task.agentName}</p>
        </div>
        <MoreButton />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <MiniBadge>{task.category}</MiniBadge>
        <StatusBadge label={task.priority} tone={task.priority === "High" ? "danger" : task.priority === "Medium" ? "warning" : "success"} dot={false} />
      </div>
      {task.status === "running" ? (
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[0.68rem] text-slate-400">
            <span>{task.progress}%</span>
            <span>{task.tokenLabel}</span>
          </div>
          <ProgressBar value={task.progress} />
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[0.68rem] text-slate-400">
        <span>{task.dueLabel}</span>
        <span>{task.status === "approval" ? `Est. cost ${task.tokenLabel}` : task.tokenLabel}</span>
      </div>
      <div className="mt-2.5 flex gap-2">
        {task.status === "approval" ? (
          <>
            <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" onClick={(event) => { event.stopPropagation(); toast.message("Review state is local until approvals are exposed here."); }}>Review</Button>
            <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] border-rose-400/20 px-2 text-[0.7rem] text-rose-200" onClick={(event) => { event.stopPropagation(); toast.message("Reject state is local until approvals are exposed here."); }}>Reject</Button>
          </>
        ) : task.status === "running" ? (
          <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" onClick={(event) => { event.stopPropagation(); toast.message("Pause is not exposed by the current task API."); }}>
            <Pause className="mr-1.5 h-3 w-3" /> Pause
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" onClick={(event) => { event.stopPropagation(); toast.message("Open task in the inspector."); }}>
            <Play className="mr-1.5 h-3 w-3" /> Open
          </Button>
        )}
        <Button variant="secondary" size="sm" className="h-7 rounded-[8px] px-2" onClick={(event) => { event.stopPropagation(); onAbort(); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function TaskListRow({ task, selected, onSelect, onAbort }: { task: TaskView; selected: boolean; onSelect: () => void; onAbort: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-white/[0.035]", selected && "bg-blue-500/[0.08]")}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{task.title}</span>
        <span className="mt-1 block truncate text-[0.68rem] text-slate-400">{task.agentName} · {task.category}</span>
      </span>
      <StatusBadge label={task.statusLabel} tone={task.statusTone} />
      <span className="w-24 text-right text-slate-400">{task.tokenLabel}</span>
      <Button variant="secondary" size="sm" className="h-7 rounded-[8px] px-2 text-[0.7rem]" onClick={(event) => { event.stopPropagation(); onAbort(); }}>Cancel</Button>
    </button>
  );
}

function TaskInspector({ task, onAbort }: { task: TaskView; onAbort: () => void }) {
  return (
    <InspectorPanelFrame title="Task Details">
      <h2 className="text-base font-semibold text-white">{task.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge label={task.statusLabel} tone={task.statusTone} />
        <span className="font-mono text-[0.68rem] text-slate-500">ID: {task.id.slice(0, 18)}</span>
      </div>
      <SectionCard title="Assigned Agent" className="mt-3">
        <div className="flex items-center justify-between gap-2 p-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{task.agentName}</p>
            <p className="mt-1 text-[0.68rem] text-slate-400">{task.category} work item</p>
          </div>
          <Button variant="secondary" size="sm" className="h-7 rounded-[8px] px-2 text-[0.7rem]" onClick={() => toast.message("Agent messaging opens from Mission Control.")}>Message</Button>
        </div>
      </SectionCard>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Objective</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-300">{task.objective}</p>
        </div>
        <div>
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Description</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-300">{task.description}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
        <MetricMini label="Status" value={task.statusLabel} />
        <MetricMini label="Priority" value={task.priority} />
        <MetricMini label="Due" value={task.dueLabel} />
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-slate-400">Progress</span>
          <span className="text-blue-300">{task.progress}%</span>
        </div>
        <ProgressBar value={task.progress} />
      </div>
      <div className="mt-4 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3">
        <KeyValue label="Policy" value="Market Research Policy v2.1" />
        <KeyValue label="Approvals" value={task.status === "approval" ? "0 / 1 pending" : "None required"} />
        <KeyValue label="Outputs / Files" value={`${task.artifactCount} files`} />
        <KeyValue label="Warnings" value={`${task.warningCount} warnings`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" className="h-8 rounded-[9px] bg-blue-500 text-xs text-white hover:bg-blue-400" onClick={() => toast.message("Open task selected in inspector.")}>Open</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" onClick={() => toast.message("Pause is not exposed by the current task API.")}>Pause</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" onClick={() => toast.message("Run Again needs a task brief confirmation flow.")}>Run Again</Button>
        <Button variant="destructive" size="sm" className="h-8 rounded-[9px] text-xs" onClick={onAbort}>Cancel</Button>
      </div>
    </InspectorPanelFrame>
  );
}

function RecentTasksPanel({ tasks }: { tasks: TaskView[] }) {
  return (
    <SectionCard title="Recent Activity" action={<button className="text-xs text-blue-300">View all activity</button>}>
      <div className="divide-y divide-white/[0.06] px-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center justify-between gap-2 py-2.5 text-[0.68rem]">
            <span className="min-w-0 truncate text-slate-300">{task.title}</span>
            <span className="shrink-0 text-slate-500">{task.statusLabel}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ScheduledTasksPanel({ tasks }: { tasks: TaskView[] }) {
  return (
    <SectionCard title="Scheduled Tasks" action={<button className="text-xs text-blue-300">View calendar</button>}>
      <div className="divide-y divide-white/[0.06] px-3">
        {tasks.map((task, index) => (
          <div key={task.id} className="grid grid-cols-[1fr_auto] gap-2 py-2.5 text-[0.68rem]">
            <span className="truncate text-slate-300">{task.title}</span>
            <span className="text-slate-500">{index % 2 ? "Daily · 10:00" : "Weekly · Mon 09:00"}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function AutomationsPanel({
  state,
  onChange
}: {
  state: Record<string, boolean>;
  onChange: (state: Record<string, boolean>) => void;
}) {
  return (
    <SectionCard title="Automations" action={<button className="text-xs text-blue-300">Manage</button>}>
      <div className="divide-y divide-white/[0.06] px-3">
        {Object.entries(state).map(([label, enabled]) => (
          <button
            type="button"
            key={label}
            onClick={() => onChange({ ...state, [label]: !enabled })}
            className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-[0.68rem]"
          >
            <span className="text-slate-300">{label}</span>
            <span className={cn("h-4 w-7 rounded-full p-0.5 transition-colors", enabled ? "bg-emerald-400" : "bg-white/[0.12]")}>
              <span className={cn("block h-3 w-3 rounded-full bg-white transition-transform", enabled && "translate-x-3")} />
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function FilesPageContent({
  snapshot,
  activeWorkspaceId
}: {
  snapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
}) {
  const activeWorkspace = activeWorkspaceId
    ? snapshot.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null
    : null;
  const visibleWorkspaces = useMemo(
    () => (activeWorkspaceId ? (activeWorkspace ? [activeWorkspace] : []) : snapshot.workspaces),
    [activeWorkspace, activeWorkspaceId, snapshot.workspaces]
  );
  const [filesByWorkspace, setFilesByWorkspace] = useState<Record<string, WorkspaceManagedFile[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("All Files");
  const [view, setView] = useState<"grid" | "list">("list");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [tab, setTab] = useState<"Details" | "Versions" | "Activity">("Details");

  useEffect(() => {
    if (visibleWorkspaces.length === 0) {
      setFilesByWorkspace({});
      setFileError(null);
      return;
    }

    let cancelled = false;
    setIsLoadingFiles(true);
    setFileError(null);

    void (async () => {
      const entries = await Promise.all(
        visibleWorkspaces.map(async (workspace) => {
          try {
            const response = await fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/files`, {
              cache: "no-store"
            });
            const result = (await response.json()) as WorkspaceManagedFileListResponse & { error?: string };
            if (!response.ok || result.error) {
              throw new Error(result.error || "Workspace files could not be loaded.");
            }
            return { workspaceId: workspace.id, files: result.files, error: null as string | null };
          } catch (error) {
            return {
              workspaceId: workspace.id,
              files: [] as WorkspaceManagedFile[],
              error: `${workspace.name}: ${error instanceof Error ? error.message : "Workspace files could not be loaded."}`
            };
          }
        })
      );

      if (!cancelled) {
        setFilesByWorkspace(
          Object.fromEntries(entries.map((entry) => [entry.workspaceId, entry.files]))
        );
        const errors = entries.map((entry) => entry.error).filter((error): error is string => Boolean(error));
        if (errors.length > 0) {
          setFileError(errors.join(" "));
        }
        setIsLoadingFiles(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleWorkspaces]);

  const fileViews = useMemo(
    () =>
      visibleWorkspaces.flatMap((workspace) =>
        buildFileViews(
          filesByWorkspace[workspace.id] ?? [],
          workspace,
          snapshot.agents.filter((agent) => agent.workspaceId === workspace.id)
        )
      ),
    [filesByWorkspace, snapshot.agents, visibleWorkspaces]
  );

  const selectedFile = fileViews.find((file) => file.id === selectedFileId) ?? fileViews[0] ?? null;
  const filteredFiles = fileViews.filter((file) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [file.name, file.path, file.type, file.owner, file.workspaceName, ...file.tags].join(" ").toLowerCase().includes(query);
    const matchesCollection = collection === "All Files" || file.collection === collection;
    return matchesSearch && matchesCollection;
  });
  const totalSize = fileViews.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0);
  const generatedCount = fileViews.filter((file) => file.collection === "Generated Outputs").length;
  const memoryCount = fileViews.filter((file) => file.collection === "Memory").length;
  const coreCount = fileViews.filter((file) => file.collection === "Core Knowledge").length;
  const collectionItems = ["All Files", "Core Knowledge", "Memory", "Generated Outputs", "Reports", "Screenshots", "Datasets", "Campaigns", "Archived", "Trash"];

  const revealFile = async (file: FileView) => {
    if (!file.workspacePath) {
      toast.message("This file is not attached to a workspace.");
      return;
    }

    try {
      const response = await fetch("/api/files/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.source?.path ?? file.relativePath, basePath: file.workspacePath })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Unable to reveal file.");
      }
      toast.success("File revealed in Finder.");
    } catch (error) {
      toast.error("File open failed.", {
        description: error instanceof Error ? error.message : "Unknown file error."
      });
    }
  };

  return (
    <OperationsPageLayout
      main={
        <>
          <PageHeader
            title="Files"
            subtitle="Manage workspace documents, knowledge files, memory, and generated outputs."
            secondaryAction={{ label: "Import from Agent", icon: Import, onClick: () => toast.message("Agent output import will use runtime artifacts when exposed here.") }}
            primaryAction={{ label: "Upload Files", icon: Upload, onClick: () => toast.message("Uploads are not exposed by the current workspace file API.") }}
          />

          <StatGrid columns={5}>
            <StatCard label="Total Files" value={String(fileViews.length)} detail={isLoadingFiles ? "Loading workspace files" : `${filteredFiles.length} visible`} icon={FileText} tone="info" />
            <StatCard label="Core Files" value={String(coreCount)} detail={`${Math.round((coreCount / Math.max(1, fileViews.length)) * 100)}% of total`} icon={FilePlus2} tone="success" />
            <StatCard label="Generated Outputs" value={String(generatedCount)} detail="From tasks and skills" icon={BrainCircuit} tone="purple" />
            <StatCard label="Memory Docs" value={String(memoryCount)} detail="Durable context" icon={Database} tone="warning" />
            <StatCard label="Storage Used" value={formatBytes(totalSize || 2_420_000_000)} detail={totalSize ? "Workspace files" : "Waiting for file sizes"} icon={HardDrive} tone="info" />
          </StatGrid>

          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search files..."
            right={<ViewToggle value={view} onChange={setView} />}
          >
            <ToolbarButton icon={Filter} label="Filter" />
            <ToolbarButton icon={ListFilter} label="All Types" chevron />
            <ToolbarButton icon={SlidersHorizontal} label="Sort: Last updated" chevron />
          </SearchToolbar>

          {fileError ? (
            <div className="rounded-[10px] border border-amber-300/20 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100">{fileError}</div>
          ) : null}

          <div className="grid gap-2.5 xl:grid-cols-[180px_minmax(0,1fr)]">
            <SectionCard title="Collections" action={<button className="text-slate-400 hover:text-white"><Plus className="h-3.5 w-3.5" /></button>}>
              <div className="flex flex-col gap-1 p-2.5">
                {collectionItems.map((item) => {
                  const Icon = fileCollectionIcons[item] ?? Folder;
                  const count = item === "All Files" ? fileViews.length : fileViews.filter((file) => file.collection === item).length;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setCollection(item)}
                      className={cn("flex items-center justify-between gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs transition-colors", collection === item ? "bg-blue-500/[0.14] text-blue-200" : "text-slate-300 hover:bg-white/[0.05] hover:text-white")}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item}</span>
                      </span>
                      <span className="text-[0.68rem] text-slate-500">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto border-t border-white/[0.07] p-3">
                <div className="mb-2 flex items-center justify-between text-[0.68rem] text-slate-400">
                  <span>Storage</span>
                  <span>{totalSize ? "Live" : "Sample"}</span>
                </div>
                <ProgressBar value={totalSize ? Math.min(100, (totalSize / 10_000_000_000) * 100) : 24} />
                <Button variant="secondary" size="sm" className="mt-3 h-7 w-full rounded-[8px] px-2 text-[0.7rem]" onClick={() => toast.message("Storage management is not exposed yet.")}>Manage Storage</Button>
              </div>
            </SectionCard>

            <SectionCard title={`Files (${fileViews.length})`}>
              {view === "list" ? (
                <FilesTable files={filteredFiles} selectedId={selectedFile?.id} onSelect={setSelectedFileId} />
              ) : (
                <div className="grid gap-2.5 p-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {filteredFiles.map((file) => (
                    <button key={file.id} type="button" onClick={() => setSelectedFileId(file.id)} className={cn("rounded-[10px] border p-3 text-left hover:bg-white/[0.05]", file.id === selectedFile?.id ? "border-blue-400/60 bg-blue-500/[0.08]" : "border-white/[0.08] bg-white/[0.03]")}>
                      <div className="flex items-start gap-2.5">
                        <EntityIcon icon={file.icon} label={file.name} tone={file.iconTone} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-white">{file.name}</span>
                          <span className="mt-1 block truncate text-[0.68rem] text-slate-500">{file.path}</span>
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">{file.tags.map((tag) => <MiniBadge key={tag}>{tag}</MiniBadge>)}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2.5 text-[0.68rem] text-slate-400">
                <span>Showing 1 to {filteredFiles.length} of {fileViews.length} files</span>
                <span className="flex items-center gap-2"><button className="rounded border border-blue-400/40 px-2 py-1 text-blue-200">1</button><button>2</button><button>3</button><span>...</span></span>
              </div>
            </SectionCard>
          </div>
        </>
      }
      inspector={selectedFile ? <FileInspector file={selectedFile} tab={tab} onTabChange={setTab} onReveal={() => revealFile(selectedFile)} /> : null}
    />
  );
}

function FilesTable({
  files,
  selectedId,
  onSelect
}: {
  files: FileView[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-[0.72rem]">
        <thead className="border-b border-white/[0.07] text-[0.56rem] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="w-8 px-3 py-2.5"><span className="block h-3.5 w-3.5 rounded border border-white/[0.14]" /></th>
            <th className="px-2 py-2.5 font-semibold">Name</th>
            <th className="px-2 py-2.5 font-semibold">Type</th>
            <th className="px-2 py-2.5 font-semibold">Last Updated</th>
            <th className="px-2 py-2.5 font-semibold">Owner / Agent</th>
            <th className="px-2 py-2.5 font-semibold">Size</th>
            <th className="px-2 py-2.5 font-semibold">Tags</th>
            <th className="px-2 py-2.5 font-semibold">Tasks</th>
            <th className="px-3 py-2.5 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] text-slate-300">
          {files.map((file) => (
            <tr
              key={file.id}
              onClick={() => onSelect(file.id)}
              className={cn("cursor-pointer hover:bg-white/[0.035]", file.id === selectedId && "bg-blue-500/[0.10] outline outline-1 outline-blue-400/50")}
            >
              <td className="px-3 py-2.5"><span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", file.id === selectedId ? "border-blue-400 bg-blue-500 text-white" : "border-white/[0.14]")}><Check className="h-2.5 w-2.5" /></span></td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2.5">
                  <EntityIcon icon={file.icon} label={file.name} tone={file.iconTone} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{file.name}</span>
                    <span className="mt-0.5 block truncate text-[0.66rem] text-slate-500">{file.workspaceName} · {file.path}</span>
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5"><MiniBadge>{file.type}</MiniBadge></td>
              <td className="px-2 py-2.5">{file.updatedLabel}</td>
              <td className="px-2 py-2.5"><span className="line-clamp-2 max-w-24">{file.owner}</span></td>
              <td className="px-2 py-2.5">{file.sizeLabel}</td>
              <td className="px-2 py-2.5"><div className="flex max-w-28 flex-wrap gap-1">{file.tags.slice(0, 2).map((tag) => <MiniBadge key={tag}>{tag}</MiniBadge>)}</div></td>
              <td className="px-2 py-2.5 text-white">{file.tasks}</td>
              <td className="px-3 py-2.5"><MoreButton /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileInspector({
  file,
  tab,
  onTabChange,
  onReveal
}: {
  file: FileView;
  tab: "Details" | "Versions" | "Activity";
  onTabChange: (tab: "Details" | "Versions" | "Activity") => void;
  onReveal: () => void;
}) {
  return (
    <InspectorPanelFrame>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <EntityIcon icon={file.icon} label={file.name} tone={file.iconTone} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">{file.name}</h2>
            <div className="mt-1.5 flex gap-1.5"><MiniBadge>{file.type}</MiniBadge><MiniBadge>{file.sizeLabel}</MiniBadge></div>
          </div>
        </div>
        <MoreButton />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" className="h-8 rounded-[9px] bg-blue-500 px-2 text-xs text-white hover:bg-blue-400" onClick={onReveal}><SquareArrowOutUpRight className="mr-1.5 h-3.5 w-3.5" />Open</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("Preview will use the existing workspace file reader in a future pass.")}>Preview</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("More file actions are pending backend support.")}>More</Button>
      </div>
      <div className="mt-3 flex border-b border-white/[0.08]">
        {(["Details", "Versions", "Activity"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTabChange(item)}
            className={cn("border-b-2 px-3 py-2.5 text-xs transition-colors", tab === item ? "border-blue-400 text-blue-200" : "border-transparent text-slate-400 hover:text-white")}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Details" ? (
        <>
          <div className="mt-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3">
            <KeyValue label="File Path" value={file.path} />
            <KeyValue label="Type" value={file.type} />
            <KeyValue label="Size" value={file.sizeLabel} />
            <KeyValue label="Last Updated" value={file.updatedLabel} />
            <KeyValue label="Workspace" value={file.workspaceName} />
            <KeyValue label="Owner / Agent" value={file.owner} />
            <KeyValue label="Linked Task" value={`${file.tasks} tasks`} />
          </div>
          <div className="mt-3">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{file.tags.map((tag) => <MiniBadge key={tag}>{tag}</MiniBadge>)}</div>
          </div>
          <div className="mt-3">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Description</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-300">{file.source?.description ?? "Workspace context file managed by AgentOS and OpenClaw."}</p>
          </div>
        </>
      ) : tab === "Versions" ? (
        <div className="mt-3 divide-y divide-white/[0.07] rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3">
          {["v3.4 (current)", "v3.3", "v3.2"].map((version, index) => (
            <div key={version} className="flex items-center justify-between gap-2 py-2.5 text-xs">
              <span className="text-blue-200">{version}</span>
              <span className="text-slate-400">{index === 0 ? "Current" : `${index + 2} days ago`}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {["Opened by workspace", "Added to context", "Linked to task"].map((event, index) => (
            <div key={event} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5 text-xs text-slate-300">
              <span className="text-white">{event}</span>
              <span className="ml-2 text-[0.68rem] text-slate-500">{index + 1}h ago</span>
            </div>
          ))}
        </div>
      )}
      <SectionCard title="Quick Actions" className="mt-4">
        <div className="grid grid-cols-2 gap-2 p-2.5">
          <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("Share is pending backend support.")}>Share</Button>
          <Button variant="secondary" size="sm" className="h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("Added to local context selection.")}>Add to Context</Button>
          <Button variant="destructive" size="sm" className="col-span-2 h-8 rounded-[9px] px-2 text-xs" onClick={() => toast.message("Move to Trash requires file mutation support.")}>Move to Trash</Button>
        </div>
      </SectionCard>
    </InspectorPanelFrame>
  );
}

function ModelsPageContent({
  snapshot,
  activeWorkspaceId
}: {
  snapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
}) {
  const models = useMemo(
    () => buildModelViews(snapshot, { useExamples: !activeWorkspaceId }),
    [activeWorkspaceId, snapshot]
  );
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("All Providers");
  const [selectedId, setSelectedId] = useState(models[0]?.id ?? "");
  const [localRoles, setLocalRoles] = useState<Record<string, ModelView["role"]>>({});
  const [tab, setTab] = useState<"Details" | "Capabilities" | "Performance">("Details");

  const effectiveModels = models.map((model) => ({ ...model, role: localRoles[model.id] ?? model.role }));
  const providers = ["All Providers", ...Array.from(new Set(effectiveModels.map((model) => model.provider)))];
  const filteredModels = effectiveModels.filter((model) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [model.name, model.provider, model.id, model.role].join(" ").toLowerCase().includes(query);
    const matchesProvider = provider === "All Providers" || model.provider === provider;
    return matchesSearch && matchesProvider;
  });
  const selectedModel = effectiveModels.find((model) => model.id === selectedId) ?? filteredModels[0] ?? effectiveModels[0] ?? null;
  const connectedProviders = new Set(effectiveModels.filter((model) => model.statusTone !== "danger").map((model) => model.provider)).size;
  const tokenTotal = summarizeTokens(snapshot);

  return (
    <OperationsPageLayout
      main={
        <>
          <PageHeader
            title="Models"
            subtitle="Configure default models, providers, routing, and runtime preferences for your AI agents."
            secondaryAction={{ label: "Import Model", icon: Import, onClick: () => toast.message("Import Model is handled by the Add Models flow in Mission Control.") }}
            primaryAction={{ label: "Add Model", icon: Plus, onClick: () => toast.message("Use Mission Control Add Models to connect providers and discover models.") }}
          />

          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search models..."
          >
            <ToolbarButton icon={Database} label={provider} chevron onClick={() => setProvider((current) => providers[(providers.indexOf(current) + 1) % providers.length])} />
            <ToolbarButton icon={Filter} label="Filter" />
            <ToolbarButton icon={SlidersHorizontal} label="Sort: Last active" chevron />
          </SearchToolbar>

          <StatGrid columns={4}>
            <StatCard label="Connected Providers" value={String(connectedProviders)} detail="+1 this week" icon={Plug} tone="info" />
            <StatCard label="Active Models" value={String(effectiveModels.filter((model) => model.statusTone !== "danger").length)} detail="+2 this week" icon={BrainCircuit} tone="success" />
            <StatCard label="Default Models" value={String(effectiveModels.filter((model) => model.role === "Primary").length)} detail="Across use cases" icon={CircleCheck} tone="warning" />
            <StatCard label="Requests This Week" value="128.4K" detail="+18% vs last 7d" icon={Activity} tone="purple" />
            <StatCard label="Token Usage" value={formatBigNumber(tokenTotal || 4_210_000_000)} detail={tokenTotal ? "From live runtimes" : "+22% vs last 7d"} icon={Sparkles} tone="purple" />
            <StatCard label="Model Cost (7D)" value="$128.47" detail="+15% vs last 7d" icon={CircleDollarSign} tone="muted" />
          </StatGrid>

          <SectionCard title="Providers & Models">
            <ModelsTable models={filteredModels} selectedId={selectedModel?.id} onSelect={setSelectedId} />
          </SectionCard>

          <div className="grid gap-2.5 xl:grid-cols-[0.9fr_1.6fr]">
            <SectionCard title="Default by Use Case">
              <div className="divide-y divide-white/[0.07] px-3">
                {["Reasoning & Analysis", "Chat & Conversation", "Research & Summarization", "Automation & Tool Use", "Low-Cost Background Tasks"].map((useCase, index) => {
                  const model = effectiveModels[index % Math.max(1, effectiveModels.length)];
                  return (
                    <div key={useCase} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-2.5 text-xs">
                      <span className="truncate text-slate-300">{useCase}</span>
                      <MiniBadge>Primary</MiniBadge>
                      <span className="truncate text-white">{model?.name ?? "Unassigned"}</span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
            <SectionCard title="Model Routing & Usage (7D)">
              <div className="p-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <MetricMini label="Total Requests" value="128.4K" />
                  <MetricMini label="Total Tokens" value={formatBigNumber(tokenTotal || 4_210_000_000)} />
                  <MetricMini label="Avg Latency" value="286ms" />
                </div>
                <UsageChart className="mt-4" />
              </div>
            </SectionCard>
          </div>
        </>
      }
      inspector={
        selectedModel ? (
          <ModelInspector
            model={selectedModel}
            tab={tab}
            onTabChange={setTab}
            onSetRole={(role) => {
              setLocalRoles((current) => ({ ...current, [selectedModel.id]: role }));
              toast.success(`${selectedModel.name} set as ${role.toLowerCase()}.`);
            }}
          />
        ) : null
      }
    />
  );
}

function ModelsTable({
  models,
  selectedId,
  onSelect
}: {
  models: ModelView[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-white/[0.07] text-[0.56rem] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            {["Model / Provider", "Status", "Latency", "Context Window", "Cost (Input / Output)", "Rate Limit", "Role", "Last Active", "Actions"].map((header) => (
              <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] text-slate-300">
          {models.map((model) => (
            <tr key={model.id} onClick={() => onSelect(model.id)} className={cn("cursor-pointer hover:bg-white/[0.035]", model.id === selectedId && "bg-blue-500/[0.10] outline outline-1 outline-blue-400/50")}>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <EntityIcon icon={BrainCircuit} label={model.name} tone={model.statusTone} size="sm" />
                  <span><span className="block font-semibold text-white">{model.name}</span><span className="text-[0.66rem] text-slate-500">{model.provider}</span></span>
                </div>
              </td>
              <td className="px-3 py-2.5"><StatusBadge label={model.statusLabel} tone={model.statusTone} /></td>
              <td className="px-3 py-2.5">{model.latencyLabel}</td>
              <td className="px-3 py-2.5">{model.contextLabel}</td>
              <td className="px-3 py-2.5">{model.costLabel}<span className="block text-[0.66rem] text-slate-500">per 1M tokens</span></td>
              <td className="px-3 py-2.5">{model.rateLimitLabel}</td>
              <td className="px-3 py-2.5"><StatusBadge label={model.role} tone={model.role === "Primary" ? "info" : model.role === "Fallback" ? "purple" : model.role === "Secondary" ? "success" : "warning"} dot={false} /></td>
              <td className="px-3 py-2.5">{model.lastActiveLabel}</td>
              <td className="px-3 py-2.5"><MoreButton /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelInspector({
  model,
  tab,
  onTabChange,
  onSetRole
}: {
  model: ModelView;
  tab: "Details" | "Capabilities" | "Performance";
  onTabChange: (tab: "Details" | "Capabilities" | "Performance") => void;
  onSetRole: (role: ModelView["role"]) => void;
}) {
  return (
    <InspectorPanelFrame>
      <div className="flex items-start gap-2.5">
        <EntityIcon icon={BrainCircuit} label={model.name} tone={model.statusTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">{model.name}</h2>
              <p className="mt-1 text-xs text-slate-300">{model.provider}</p>
            </div>
            <StatusBadge label={model.statusLabel} tone={model.statusTone} />
          </div>
          <p className="mt-2.5 text-xs leading-5 text-slate-300">Most capable configured model route for AgentOS agents.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" className="col-span-2 h-8 rounded-[9px] bg-blue-500 text-xs text-white hover:bg-blue-400" onClick={() => onSetRole("Primary")}>Set as Primary</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs text-violet-200" onClick={() => onSetRole("Fallback")}>Set as Fallback</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" onClick={() => toast.message("Model editing is handled by the Add Models flow.")}>Edit</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" onClick={() => toast.message("Disable is local until model removal is exposed here.")}>Disable</Button>
      </div>
      <div className="mt-3 flex border-b border-white/[0.08]">
        {(["Details", "Capabilities", "Performance"] as const).map((item) => (
          <button key={item} type="button" onClick={() => onTabChange(item)} className={cn("border-b-2 px-3 py-2.5 text-xs", tab === item ? "border-blue-400 text-blue-200" : "border-transparent text-slate-400 hover:text-white")}>{item}</button>
        ))}
      </div>
      {tab === "Details" ? (
        <div className="mt-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3">
          <KeyValue label="Provider" value={model.provider} />
          <KeyValue label="API Status" value={model.statusLabel} />
          <KeyValue label="Model ID" value={model.id} />
          <KeyValue label="Context Window" value={model.contextLabel} />
          <KeyValue label="Max Output" value="32,768 tokens" />
          <KeyValue label="Knowledge Cutoff" value="Apr 2025" />
          <KeyValue label="Cost / 1M" value={model.costLabel} />
        </div>
      ) : tab === "Capabilities" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">{model.capabilities.map((capability) => <MiniBadge key={capability}>{capability}</MiniBadge>)}</div>
      ) : (
        <div className="mt-4">
          <UsageChart />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <MetricMini label="Latency" value={model.latencyLabel} />
            <MetricMini label="Rate Limit" value={model.rateLimitLabel} />
          </div>
        </div>
      )}
    </InspectorPanelFrame>
  );
}

type IntegrationSortMode = "last-active" | "name" | "status" | "category";
type IntegrationRuntimeOverride = Partial<Pick<
  IntegrationView,
  "status" | "statusLabel" | "statusTone" | "connectionHealth" | "lastSyncLabel" | "uptimeLabel" | "rateLimitLabel" | "errorMessage"
>> & {
  sourceMethods?: string[];
};

const integrationStatusToneMap: Record<IntegrationStatus, IntegrationView["statusTone"]> = {
  connected: "success",
  disabled: "muted",
  "pending-setup": "warning",
  failed: "danger",
  "needs-authentication": "warning",
  "missing-credentials": "warning",
  unsupported: "muted",
  unknown: "muted"
};

function IntegrationsPageContent({
  snapshot,
  rootSnapshot,
  activeWorkspaceId,
  refresh,
  setSnapshot
}: {
  snapshot: MissionControlSnapshot;
  rootSnapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
  refresh: () => Promise<void>;
  setSnapshot: Dispatch<SetStateAction<MissionControlSnapshot>>;
}) {
  const baseIntegrations = useMemo(() => buildIntegrationViews(snapshot), [snapshot]);
  const [runtimeOverrides, setRuntimeOverrides] = useState<Record<string, IntegrationRuntimeOverride>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [status, setStatus] = useState<"All Statuses" | IntegrationStatus>("All Statuses");
  const [sort, setSort] = useState<IntegrationSortMode>("last-active");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState(baseIntegrations[0]?.id ?? "");
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isChannelsDialogOpen, setIsChannelsDialogOpen] = useState(false);
  const [isAddModelsDialogOpen, setIsAddModelsDialogOpen] = useState(false);
  const [initialModelProvider, setInitialModelProvider] = useState<AddModelsProviderId | null>(null);
  const [initialSurfaceProvider, setInitialSurfaceProvider] = useState<IntegrationView["surfaceProvider"] | null>(null);
  const integrations = useMemo(
    () =>
      baseIntegrations.map((integration) => {
        const override = runtimeOverrides[integration.id];
        if (!override) {
          return integration;
        }

        const statusOverride = override.status
          ? {
              status: override.status,
              statusLabel: override.statusLabel ?? integration.statusLabel,
              statusTone: override.statusTone ?? integrationStatusToneMap[override.status]
            }
          : {};

        return {
          ...integration,
          ...override,
          ...statusOverride,
          sourceMethods: Array.from(new Set([
            ...integration.sourceMethods,
            ...(override.sourceMethods ?? [])
          ]))
        };
      }),
    [baseIntegrations, runtimeOverrides]
  );
  const categories = ["All Categories", ...Array.from(new Set(integrations.map((integration) => integration.category)))];
  const statuses: Array<"All Statuses" | IntegrationStatus> = [
    "All Statuses",
    "connected",
    "unknown",
    "pending-setup",
    "missing-credentials",
    "needs-authentication",
    "failed",
    "disabled",
    "unsupported"
  ];
  const sorts: IntegrationSortMode[] = ["last-active", "name", "status", "category"];

  const filteredIntegrations = integrations.filter((integration) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [
        integration.name,
        integration.category,
        integration.description,
        integration.statusLabel,
        integration.managedBy,
        integration.providerType,
        integration.permissions.join(" "),
        integration.setupRequirements.join(" ")
      ].join(" ").toLowerCase().includes(query);
    const matchesCategory = category === "All Categories" || integration.category === category;
    const matchesStatus = status === "All Statuses" || integration.status === status;
    return matchesSearch && matchesCategory && matchesStatus;
  }).sort((left, right) => sortIntegrations(left, right, sort));
  const selectedIntegration = filteredIntegrations.find((integration) => integration.id === selectedId) ?? filteredIntegrations[0] ?? null;
  const connectedCount = filteredIntegrations.filter((integration) => integration.status === "connected").length;
  const pendingCount = filteredIntegrations.filter((integration) =>
    integration.status === "pending-setup" ||
    integration.status === "missing-credentials" ||
    integration.status === "needs-authentication"
  ).length;
  const failedCount = filteredIntegrations.filter((integration) => integration.status === "failed").length;

  const openSurfaceSetup = (surfaceProvider: IntegrationView["surfaceProvider"] | null = null) => {
    if (!activeWorkspaceId) {
      toast.error("Select a workspace before configuring workspace surfaces.", {
        description: "All Workspaces is read-only for surface setup. Pick a workspace from the sidebar first."
      });
      return;
    }

    setInitialSurfaceProvider(surfaceProvider);
    setIsChannelsDialogOpen(true);
  };

  const openModelSetup = (provider: AddModelsProviderId | null = null) => {
    setInitialModelProvider(provider);
    setIsAddModelsDialogOpen(true);
  };

  const handleConfigureIntegration = (integration: IntegrationView) => {
    if (!integration.actionSupport.configure.supported) {
      toast.message("Configure is not available.", {
        description: integration.actionSupport.configure.reason
      });
      return;
    }

    if (integration.modelProvider) {
      openModelSetup(integration.modelProvider);
      return;
    }

    if (integration.surfaceProvider) {
      openSurfaceSetup(integration.surfaceProvider);
      return;
    }

    toast.message("No setup flow is wired for this integration.", {
      description: integration.actionSupport.configure.reason
    });
  };

  const handleReconnectIntegration = async (integration: IntegrationView) => {
    if (!integration.actionSupport.reconnect.supported) {
      toast.message("Reconnect is not available.", {
        description: integration.actionSupport.reconnect.reason
      });
      return;
    }

    const actionKey = `${integration.id}:reconnect`;
    setRunningAction(actionKey);

    try {
      if (integration.modelProvider) {
        const response = await fetch("/api/models/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            provider: integration.modelProvider,
            includeSnapshot: true
          })
        });
        const result = await response.json().catch(() => null) as {
          ok?: boolean;
          message?: string;
          error?: string;
          connection?: {
            connected?: boolean;
            detail?: string | null;
            canConnect?: boolean;
          };
          snapshot?: MissionControlSnapshot;
        } | null;

        if (!response.ok || !result) {
          throw new Error(result?.error || "Model provider status check failed.");
        }

        if (result.snapshot) {
          setSnapshot(result.snapshot);
        }

        const nextStatus: IntegrationStatus = result.connection?.connected
          ? "connected"
          : integration.modelProvider === "ollama"
            ? "pending-setup"
            : "missing-credentials";
        setRuntimeOverrides((current) => ({
          ...current,
          [integration.id]: {
            status: nextStatus,
            statusLabel: formatIntegrationStatusLabel(nextStatus),
            statusTone: integrationStatusToneMap[nextStatus],
            connectionHealth: {
              label: result.connection?.connected ? "Provider status verified" : "Provider not connected",
              detail: result.connection?.detail ?? result.message ?? "Provider status was refreshed through /api/models/providers."
            },
            lastSyncLabel: "Checked just now",
            sourceMethods: ["/api/models/providers"]
          }
        }));

        toast.message(result.connection?.connected ? "Provider is ready." : "Provider needs setup.", {
          description: result.connection?.detail ?? result.message
        });
        return;
      }

      if (integration.surfaceProvider) {
        const response = await fetch(`/api/integrations/${encodeURIComponent(integration.id)}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const result = await response.json().catch(() => null) as {
          ok?: boolean;
          status?: IntegrationStatus;
          statusLabel?: string;
          connectionHealth?: IntegrationView["connectionHealth"];
          lastSyncLabel?: string;
          uptimeLabel?: string;
          rateLimitLabel?: string;
          errorMessage?: string | null;
          sourceMethods?: string[];
          error?: string;
        } | null;

        const resultStatus = result?.status;
        if (!response.ok || !resultStatus) {
          throw new Error(result?.error || "Integration status check failed.");
        }

        setRuntimeOverrides((current) => ({
          ...current,
          [integration.id]: {
            status: resultStatus,
            statusLabel: result.statusLabel ?? formatIntegrationStatusLabel(resultStatus),
            statusTone: integrationStatusToneMap[resultStatus],
            connectionHealth: result.connectionHealth ?? {
              label: formatIntegrationStatusLabel(resultStatus),
              detail: "OpenClaw channel status was refreshed."
            },
            lastSyncLabel: result.lastSyncLabel ?? "Checked just now",
            uptimeLabel: result.uptimeLabel,
            rateLimitLabel: result.rateLimitLabel,
            errorMessage: result.errorMessage,
            sourceMethods: result.sourceMethods
          }
        }));

        toast.message(result.status === "connected" ? "Integration status verified." : "Status check completed.", {
          description: result.connectionHealth?.detail
        });
        return;
      }

      toast.message("Reconnect is not wired for this integration.", {
        description: integration.actionSupport.reconnect.reason
      });
    } catch (error) {
      const message = readClientError(error);
      setRuntimeOverrides((current) => ({
        ...current,
        [integration.id]: {
          status: "unknown",
          statusLabel: "Unknown",
          statusTone: "muted",
          connectionHealth: {
            label: "Status check failed",
            detail: message
          },
          lastSyncLabel: "Check failed",
          errorMessage: message
        }
      }));
      toast.error("Reconnect failed.", {
        description: message
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleDisableIntegration = async (integration: IntegrationView) => {
    if (!integration.actionSupport.disable.supported) {
      toast.message("Disable is not available.", {
        description: integration.actionSupport.disable.reason
      });
      return;
    }

    if (!activeWorkspaceId) {
      toast.error("Select a workspace before disabling a surface.", {
        description: "All Workspaces cannot safely remove a workspace-specific binding."
      });
      return;
    }

    if (integration.channelIds.length === 0) {
      toast.message("No workspace binding found.", {
        description: "There is no AgentOS workspace surface binding to disconnect."
      });
      return;
    }

    const actionKey = `${integration.id}:disable`;
    setRunningAction(actionKey);

    try {
      for (const channelId of integration.channelIds) {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(activeWorkspaceId)}/channels`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, scope: "workspace" })
        });
        const result = await response.json().catch(() => null) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error || `Unable to disconnect ${channelId}.`);
        }
      }

      await refresh();
      setRuntimeOverrides((current) => ({
        ...current,
        [integration.id]: {
          status: "disabled",
          statusLabel: "Disabled",
          statusTone: "muted",
          connectionHealth: {
            label: "Disconnected from workspace",
            detail: "The workspace surface binding was removed through the channels API."
          },
          lastSyncLabel: "Updated just now",
          sourceMethods: ["/api/workspaces/[workspaceId]/channels DELETE"]
        }
      }));
      toast.success(`${integration.name} disconnected from this workspace.`);
    } catch (error) {
      toast.error("Disable failed.", {
        description: readClientError(error)
      });
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <>
      <OperationsPageLayout
        main={
          <>
            <PageHeader
              title="Integrations"
              subtitle="Connect channels, tools, and external systems to extend AgentOS capabilities and power automations."
              secondaryAction={{ label: "Import Integration", icon: Import, onClick: () => setIsImportDialogOpen(true) }}
              primaryAction={{ label: "Add Integration", icon: Plus, onClick: () => setIsAddDialogOpen(true) }}
            />

            <SearchToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search integrations..."
              right={<ViewToggle value={view} onChange={setView} />}
            >
              <ToolbarButton icon={Layers3} label={category} chevron onClick={() => setCategory((current) => categories[(categories.indexOf(current) + 1) % categories.length])} />
              <ToolbarButton icon={SearchCheck} label={formatIntegrationStatusFilterLabel(status)} chevron onClick={() => setStatus((current) => statuses[(statuses.indexOf(current) + 1) % statuses.length])} />
              <ToolbarButton icon={SlidersHorizontal} label={`Sort: ${formatIntegrationSortLabel(sort)}`} chevron onClick={() => setSort((current) => sorts[(sorts.indexOf(current) + 1) % sorts.length])} />
            </SearchToolbar>

            <StatGrid columns={5}>
              <StatCard label="Total Integrations" value={String(filteredIntegrations.length)} detail={`${integrations.length} registered`} icon={Plug} tone="info" />
              <StatCard label="Connected" value={String(connectedCount)} detail={`${Math.round((connectedCount / Math.max(1, filteredIntegrations.length)) * 100)}% of filtered`} icon={CircleCheck} tone="success" />
              <StatCard label="Pending Setup" value={String(pendingCount)} detail="Needs setup or credentials" icon={Clock3} tone="warning" />
              <StatCard label="Failed" value={String(failedCount)} detail="Real errors only" icon={X} tone="danger" />
              <StatCard label="Automations Using" value="-" detail="Metrics unavailable from snapshot" icon={Workflow} tone="purple" />
            </StatGrid>

            {filteredIntegrations.length === 0 ? (
              <EmptyState
                title="No integrations match"
                description="Adjust search, category, or status filters to inspect another integration set."
              />
            ) : (
              <div className="space-y-3">
                {Array.from(new Set(filteredIntegrations.map((integration) => integration.category))).map((section) => (
                  <section key={section}>
                    <h2 className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">{section} ({filteredIntegrations.filter((integration) => integration.category === section).length})</h2>
                    <div className={cn(view === "grid" ? "grid gap-2.5 lg:grid-cols-2 min-[1400px]:grid-cols-3" : "flex flex-col gap-2.5")}>
                      {filteredIntegrations.filter((integration) => integration.category === section).map((integration) => (
                        <IntegrationCard
                          key={integration.id}
                          integration={integration}
                          selected={integration.id === selectedIntegration?.id}
                          list={view === "list"}
                          actionBusy={runningAction?.startsWith(`${integration.id}:`) ?? false}
                          onSelect={() => setSelectedId(integration.id)}
                          onConfigure={() => handleConfigureIntegration(integration)}
                          onReconnect={() => void handleReconnectIntegration(integration)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <AutomationImpactSummary integrations={integrations} />
          </>
        }
        inspector={selectedIntegration ? (
          <IntegrationInspector
            integration={selectedIntegration}
            actionBusy={runningAction?.startsWith(`${selectedIntegration.id}:`) ?? false}
            activeWorkspaceId={activeWorkspaceId}
            onConfigure={() => handleConfigureIntegration(selectedIntegration)}
            onReconnect={() => void handleReconnectIntegration(selectedIntegration)}
            onDisable={() => void handleDisableIntegration(selectedIntegration)}
          />
        ) : null}
      />
      <IntegrationAddDialog
        open={isAddDialogOpen}
        integrations={integrations}
        onOpenChange={setIsAddDialogOpen}
        onSelect={(integration) => {
          setIsAddDialogOpen(false);
          handleConfigureIntegration(integration);
        }}
      />
      <IntegrationImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onOpenSurfaceSetup={() => {
          setIsImportDialogOpen(false);
          openSurfaceSetup(null);
        }}
        onOpenModelSetup={() => {
          setIsImportDialogOpen(false);
          openModelSetup(null);
        }}
      />
      <WorkspaceChannelsDialog
        snapshot={rootSnapshot}
        workspaceId={activeWorkspaceId}
        open={isChannelsDialogOpen}
        initialProvider={initialSurfaceProvider}
        onOpenChange={setIsChannelsDialogOpen}
        onRefresh={refresh}
        onSnapshotChange={(updater) => setSnapshot((current) => updater(current))}
      />
      <AddModelsDialog
        open={isAddModelsDialogOpen}
        onOpenChange={setIsAddModelsDialogOpen}
        snapshot={rootSnapshot}
        initialProvider={initialModelProvider}
        onSnapshotChange={setSnapshot}
      />
    </>
  );
}

function IntegrationCard({
  integration,
  selected,
  list,
  actionBusy,
  onSelect,
  onConfigure,
  onReconnect
}: {
  integration: IntegrationView;
  selected: boolean;
  list: boolean;
  actionBusy: boolean;
  onSelect: () => void;
  onConfigure: () => void;
  onReconnect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "rounded-[12px] border p-3 text-left transition-all hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        pageSurface,
        selected && "border-blue-400/70 bg-blue-500/[0.08]"
      )}
    >
      <div className={cn("flex gap-3", list ? "items-center" : "items-start")}>
        <EntityIcon icon={integration.icon} label={integration.name} tone={integration.iconTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[0.88rem] font-semibold text-white">{integration.name}</h3>
              <p className="mt-1 truncate text-[0.68rem] text-slate-400">{integration.connectionHealth.label}</p>
              <p className="mt-1 text-[0.68rem] text-slate-400">Linked: {integration.linkedAgentCount} agents</p>
            </div>
            <StatusBadge label={integration.statusLabel} tone={integration.statusTone} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              <MiniBadge>{integration.category.split(" ")[0]}</MiniBadge>
              <MiniBadge>{integration.managedBy}</MiniBadge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 rounded-[8px] px-2"
                disabled={actionBusy || !integration.actionSupport.configure.supported}
                title={integration.actionSupport.configure.reason}
                onClick={(event) => {
                  event.stopPropagation();
                  onConfigure();
                }}
              >
                <Gauge className="h-3 w-3" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 rounded-[8px] px-2"
                disabled={actionBusy || !integration.actionSupport.reconnect.supported}
                title={integration.actionSupport.reconnect.reason}
                onClick={(event) => {
                  event.stopPropagation();
                  onReconnect();
                }}
              >
                <RefreshCw className={cn("h-3 w-3", actionBusy && "animate-spin")} />
              </Button>
              <MoreButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationInspector({
  integration,
  actionBusy,
  activeWorkspaceId,
  onConfigure,
  onReconnect,
  onDisable
}: {
  integration: IntegrationView;
  actionBusy: boolean;
  activeWorkspaceId: string | null;
  onConfigure: () => void;
  onReconnect: () => void;
  onDisable: () => void;
}) {
  const StatusIcon = integrationStatusIcons[integration.status];
  const disableReason = activeWorkspaceId
    ? integration.actionSupport.disable.reason
    : "Select a workspace before disabling workspace-specific surface bindings.";
  return (
    <InspectorPanelFrame>
      <div className="flex items-start gap-3">
        <EntityIcon icon={integration.icon} label={integration.name} tone={integration.iconTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">{integration.name}</h2>
              <StatusBadge label={integration.statusLabel} tone={integration.statusTone} className="mt-1.5" />
            </div>
            <MoreButton />
          </div>
          <MiniBadge>{integration.category}</MiniBadge>
          <p className="mt-2.5 text-xs leading-5 text-slate-300">{integration.description}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 rounded-[9px] px-2 text-xs"
          disabled={actionBusy || !integration.actionSupport.reconnect.supported}
          title={integration.actionSupport.reconnect.reason}
          onClick={onReconnect}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", actionBusy && "animate-spin")} />Reconnect
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 rounded-[9px] px-2 text-xs"
          disabled={actionBusy || !integration.actionSupport.configure.supported}
          title={integration.actionSupport.configure.reason}
          onClick={onConfigure}
        >
          Configure
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 rounded-[9px] px-2 text-xs"
          disabled={actionBusy || !integration.actionSupport.disable.supported || !activeWorkspaceId}
          title={disableReason}
          onClick={onDisable}
        >
          Disable
        </Button>
      </div>
      <SectionCard title="Connection Health" className="mt-3">
        <div className="px-3 py-2.5">
          <KeyValue label="Health" value={<span className="inline-flex items-center gap-1.5"><StatusIcon className={cn("h-3.5 w-3.5", statusIconClassName(integration.status))} />{integration.connectionHealth.label}</span>} />
          <KeyValue label="Last sync" value={integration.lastSyncLabel} />
          <KeyValue label="Uptime" value={integration.uptimeLabel} />
          <KeyValue label="Rate limit" value={integration.rateLimitLabel} />
          <KeyValue label="Source" value={integration.sourceMethods.join(", ")} />
          <p className="border-t border-white/[0.07] py-2 text-xs leading-5 text-slate-400">{integration.connectionHealth.detail}</p>
          <ProgressBar value={integration.status === "connected" ? 84 : integration.status === "failed" ? 8 : 28} tone={integration.statusTone} />
        </div>
      </SectionCard>
      <SectionCard title="Scopes / Permissions" className="mt-3">
        <div className="space-y-1.5 p-3 text-xs text-slate-300">
          {integration.permissions.map((scope) => (
            <div key={scope} className="flex items-center gap-1.5"><CircleCheck className="h-3.5 w-3.5 text-emerald-300" />{scope}</div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title={`Linked Agents (${integration.linkedAgentCount})`} className="mt-3">
        <div className="divide-y divide-white/[0.07] px-3">
          {integration.linkedAgents.length > 0 ? integration.linkedAgents.map((agent) => (
            <div key={agent.id} className="py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-200">{agent.name}</span>
                <span className="shrink-0 text-slate-500">{agent.workspaceName}</span>
              </div>
              <p className="mt-1 truncate text-[0.66rem] text-slate-500">{agent.reason}</p>
            </div>
          )) : (
            <div className="py-3 text-xs text-slate-500">
              {integration.managedBy === "unsupported" ? "Linkage unavailable until this connector exists." : "No linked agents found in the current workspace snapshot."}
            </div>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Setup Notes" className="mt-3">
        <div className="space-y-2 p-3 text-xs leading-5 text-slate-300">
          <KeyValue label="Managed by" value={formatManagedBy(integration.managedBy)} />
          <KeyValue label="Provider type" value={integration.providerType} />
          <KeyValue label="Accounts" value={integration.accountIds.length ? integration.accountIds.join(", ") : "None"} />
          <KeyValue label="Channels" value={integration.channelIds.length ? integration.channelIds.join(", ") : "None"} />
          <KeyValue label="Models" value={integration.modelIds.length ? integration.modelIds.join(", ") : "None"} />
          {integration.errorMessage ? <p className="rounded-[9px] border border-red-400/20 bg-red-500/10 p-2 text-red-200">{integration.errorMessage}</p> : null}
          {integration.missingConfiguration.length > 0 ? (
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Required setup</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {integration.missingConfiguration.map((item) => <MiniBadge key={item}>{item}</MiniBadge>)}
              </div>
            </div>
          ) : null}
          <div className="rounded-[9px] border border-white/[0.07] bg-white/[0.03] p-2 text-slate-400">
            <p>Configure: {integration.actionSupport.configure.reason}</p>
            <p>Reconnect: {integration.actionSupport.reconnect.reason}</p>
            <p>Disable: {integration.actionSupport.disable.reason}</p>
          </div>
        </div>
      </SectionCard>
    </InspectorPanelFrame>
  );
}

function AutomationImpactSummary({ integrations }: { integrations: IntegrationView[] }) {
  const connected = integrations.filter((integration) => integration.status === "connected");
  const linked = integrations
    .filter((integration) => integration.linkedAgentCount > 0)
    .sort((left, right) => right.linkedAgentCount - left.linkedAgentCount);
  return (
    <SectionCard title="Automation Impact Summary">
      <div className="grid gap-2.5 p-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.4fr_0.8fr]">
        <MetricTile icon={Workflow} label="Automations" value="-" detail="OpenClaw metric unavailable" tone="info" />
        <MetricTile icon={Sparkles} label="Triggers fired" value="-" detail="OpenClaw metric unavailable" tone="success" />
        <MetricTile icon={BellRing} label="Actions executed" value="-" detail="OpenClaw metric unavailable" tone="purple" />
        <MetricTile icon={ShieldCheck} label="Success rate" value="-" detail="OpenClaw metric unavailable" tone="success" />
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
          <p className="mb-2.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Top linked integrations</p>
          {linked.slice(0, 3).map((integration) => (
            <div key={integration.id} className="mb-2 grid grid-cols-[80px_1fr_auto] items-center gap-2 text-[0.68rem]">
              <span className="truncate text-slate-300">{integration.name}</span>
              <ProgressBar value={Math.min(100, 20 + integration.linkedAgentCount * 18)} />
              <span className="text-slate-500">{integration.linkedAgentCount} agents</span>
            </div>
          ))}
          {linked.length === 0 ? <p className="text-[0.68rem] text-slate-500">No linked integrations found in the current snapshot.</p> : null}
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
          <p className="mb-2.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Recently observed</p>
          {connected.slice(0, 3).map((integration) => (
            <div key={integration.id} className="flex justify-between gap-2 py-1 text-[0.68rem]">
              <span className="text-slate-300">{integration.name}</span>
              <span className="text-slate-500">{integration.lastSyncLabel}</span>
            </div>
          ))}
          {connected.length === 0 ? <p className="text-[0.68rem] text-slate-500">No verified connected integrations yet.</p> : null}
        </div>
      </div>
    </SectionCard>
  );
}

function IntegrationAddDialog({
  open,
  integrations,
  onOpenChange,
  onSelect
}: {
  open: boolean;
  integrations: IntegrationView[];
  onOpenChange: (open: boolean) => void;
  onSelect: (integration: IntegrationView) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[18px] border-white/[0.10] bg-[#08111f]/95 p-4">
        <DialogHeader>
          <DialogTitle>Add Integration</DialogTitle>
          <DialogDescription>
            Choose a real AgentOS/OpenClaw setup path. Unsupported connectors are shown with their blocking reason.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {integrations.map((integration) => (
            <button
              key={integration.id}
              type="button"
              onClick={() => onSelect(integration)}
              className={cn(
                "rounded-[12px] border p-3 text-left transition hover:bg-white/[0.06]",
                pageSurface,
                !integration.actionSupport.configure.supported && "opacity-70"
              )}
            >
              <div className="flex items-start gap-3">
                <EntityIcon icon={integration.icon} label={integration.name} tone={integration.iconTone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-white">{integration.name}</h3>
                    <StatusBadge label={integration.statusLabel} tone={integration.statusTone} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{integration.description}</p>
                  <p className="mt-2 text-[0.68rem] text-slate-500">{integration.actionSupport.configure.reason}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationImportDialog({
  open,
  onOpenChange,
  onOpenSurfaceSetup,
  onOpenModelSetup
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSurfaceSetup: () => void;
  onOpenModelSetup: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[18px] border-white/[0.10] bg-[#08111f]/95 p-4">
        <DialogHeader>
          <DialogTitle>Import Integration</DialogTitle>
          <DialogDescription>
            Secure bulk import is not available because this codebase does not expose a credential import contract or secret store handoff.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-[12px] border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
          Importing tokens, OAuth secrets, bot credentials, or webhook secrets from the browser would expose sensitive values. Use the existing setup flows so OpenClaw handles credentials through its supported config paths.
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-9 rounded-[9px] bg-blue-500 text-white hover:bg-blue-400" onClick={onOpenSurfaceSetup}>
            Open Surface Setup
          </Button>
          <Button variant="secondary" className="h-9 rounded-[9px]" onClick={onOpenModelSetup}>
            Open Model Setup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sortIntegrations(left: IntegrationView, right: IntegrationView, sort: IntegrationSortMode) {
  if (sort === "name") {
    return left.name.localeCompare(right.name);
  }

  if (sort === "status") {
    return left.statusLabel.localeCompare(right.statusLabel) || left.name.localeCompare(right.name);
  }

  if (sort === "category") {
    return left.category.localeCompare(right.category) || left.name.localeCompare(right.name);
  }

  const leftTime = left.lastActiveMs ?? 0;
  const rightTime = right.lastActiveMs ?? 0;
  return rightTime - leftTime || left.name.localeCompare(right.name);
}

function formatIntegrationStatusLabel(status: IntegrationStatus) {
  switch (status) {
    case "connected":
      return "Connected";
    case "disabled":
      return "Disabled";
    case "pending-setup":
      return "Pending Setup";
    case "failed":
      return "Failed";
    case "needs-authentication":
      return "Needs Authentication";
    case "missing-credentials":
      return "Missing Credentials";
    case "unsupported":
      return "Unsupported";
    case "unknown":
      return "Unknown";
  }
}

function formatIntegrationStatusFilterLabel(status: "All Statuses" | IntegrationStatus) {
  return status === "All Statuses" ? status : formatIntegrationStatusLabel(status);
}

function formatIntegrationSortLabel(sort: IntegrationSortMode) {
  switch (sort) {
    case "last-active":
      return "Last active";
    case "name":
      return "Name";
    case "status":
      return "Status";
    case "category":
      return "Category";
  }
}

function statusIconClassName(status: IntegrationStatus) {
  if (status === "connected") {
    return "text-emerald-300";
  }

  if (status === "failed") {
    return "text-red-300";
  }

  if (status === "pending-setup" || status === "missing-credentials" || status === "needs-authentication") {
    return "text-amber-300";
  }

  return "text-slate-400";
}

function formatManagedBy(value: IntegrationView["managedBy"]) {
  switch (value) {
    case "openclaw":
      return "OpenClaw";
    case "agentos":
      return "AgentOS";
    case "external-config":
      return "External config";
    case "unsupported":
      return "Unsupported";
  }
}

function readClientError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown integration error.";
}

function OperationsPageLayout({ main, inspector }: { main: React.ReactNode; inspector: React.ReactNode }) {
  return (
    <div className={cn("grid gap-3", inspector ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "xl:grid-cols-1")}>
      <div className="flex min-w-0 flex-col gap-3">{main}</div>
      {inspector}
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "info" | "success" | "purple";
}) {
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-2.5">
        <EntityIcon icon={Icon} label={label} tone={tone} />
        <span className="min-w-0">
          <span className="block text-base font-semibold text-white">{value}</span>
          <span className="block truncate text-[0.68rem] text-slate-400">{label}</span>
        </span>
      </div>
      <p className="mt-1.5 text-[0.68rem] text-slate-500">{detail}</p>
    </div>
  );
}

function UsageChart({ className }: { className?: string }) {
  const lines = [
    "M 0 90 C 45 62 68 70 100 42 S 168 76 210 48 S 282 44 320 24",
    "M 0 112 C 38 90 70 86 105 80 S 175 98 210 72 S 275 76 320 58",
    "M 0 132 C 45 118 72 112 104 108 S 170 116 210 92 S 270 106 320 86"
  ];
  return (
    <div className={cn("h-40 rounded-[10px] border border-white/[0.08] bg-slate-950/35 p-2.5", className)}>
      <svg viewBox="0 0 320 150" className="h-full w-full overflow-visible">
        {[20, 55, 90, 125].map((y) => (
          <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
        ))}
        <path d={lines[0]} fill="none" stroke="#3b82f6" strokeWidth="3" />
        <path d={lines[1]} fill="none" stroke="#a855f7" strokeWidth="2" />
        <path d={lines[2]} fill="none" stroke="#f59e0b" strokeWidth="2" />
      </svg>
    </div>
  );
}

function agentFilterLabel(filter: AgentFilter) {
  if (filter === "all") {
    return "All";
  }

  if (filter === "needs-approval") {
    return "Needs Approval";
  }

  return toTitleCase(filter);
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
