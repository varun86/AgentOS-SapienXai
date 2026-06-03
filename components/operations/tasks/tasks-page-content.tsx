"use client";

import { useMemo, useState } from "react";
import { Activity, CircleCheck, Clock3, ClipboardList, FileInput, Filter, Layers3, Pause, Play, Plus, ShieldCheck, SlidersHorizontal, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { MissionControlSnapshot } from "@/lib/agentos/contracts";
import { cn } from "@/lib/utils";
import { buildTaskViews, formatBigNumber, summarizeTokens, taskStatusIcons, type TaskView } from "@/components/operations/operations-data";
import { EmptyState, FilterChip, InspectorPanelFrame, KeyValue, MiniBadge, MoreButton, OperationsPageLayout, PageHeader, ProgressBar, SearchToolbar, SectionCard, StatCard, StatGrid, StatusBadge, ToolbarButton, ViewToggle, pageSurface } from "@/components/operations/operations-ui";
import { canCancelTask, formatTaskFilterLabel, formatTaskSortLabel, MetricMini, MissionDispatchDialog, resolveTaskTone, sortTaskViews, UnsupportedPanel } from "@/components/operations/operations-shared";

export function TasksPageContent({
  snapshot,
  activeWorkspaceId,
  refresh
}: {
  snapshot: MissionControlSnapshot;
  activeWorkspaceId: string | null;
  refresh: () => Promise<void>;
}) {
  const tasks = useMemo(
    () => buildTaskViews(snapshot),
    [snapshot]
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | TaskView["status"]>("all");
  const [sort, setSort] = useState<"updated" | "title" | "status" | "agent">("updated");
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedId, setSelectedId] = useState(tasks[0]?.id ?? "");
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [task.title, task.agentName, task.category, task.objective, task.description].join(" ").toLowerCase().includes(query);
    const matchesFilter = filter === "all" || task.status === filter;
    return matchesSearch && matchesFilter;
  }).sort((left, right) => sortTaskViews(left, right, sort));
  const selectedTask = filteredTasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? null;
  const statusCounts: Record<TaskView["status"], number> = {
    queued: tasks.filter((task) => task.status === "queued").length,
    running: tasks.filter((task) => task.status === "running").length,
    approval: tasks.filter((task) => task.status === "approval").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    cancelled: tasks.filter((task) => task.status === "cancelled").length,
    stalled: tasks.filter((task) => task.status === "stalled").length
  };
  const tokenTotal = snapshot.tasks.reduce((sum, task) => sum + (task.tokenUsage?.total ?? 0), 0) || summarizeTokens(snapshot);
  const sortModes: Array<typeof sort> = ["updated", "title", "status", "agent"];

  const abortTask = async (task: TaskView) => {
    if (!canCancelTask(task)) {
      toast.message("Cancel is unavailable.", {
        description: "Only live, queued, stalled, or approval tasks can be cancelled through the current task API."
      });
      return;
    }

    if (!task.source) {
      toast.message("Cancel is unavailable.", {
        description: "This row is not backed by an AgentOS task record."
      });
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
    <>
      <OperationsPageLayout
      main={
        <>
          <PageHeader
            title="Tasks"
            subtitle="Plan, monitor, and execute work across your agents. Track progress and manage approvals."
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-[10px] px-3 text-xs"
                  disabled
                  title="Task import requires a backend import contract."
                >
                  <FileInput className="mr-1.5 h-3.5 w-3.5" />
                  Import Tasks
                </Button>
                <Button size="sm" className="h-8 rounded-[10px] bg-blue-500 px-3 text-xs text-white shadow-blue-500/20 hover:bg-blue-400" onClick={() => setDispatchOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Create Task
                </Button>
              </>
            }
          />

          <StatGrid columns={4}>
            <StatCard label="Total Tasks" value={String(tasks.length)} detail={`${snapshot.tasks.length} tracked from snapshot`} icon={ClipboardList} tone="info" />
            <StatCard label="Running" value={String(statusCounts.running)} detail="Live task records" icon={Activity} tone="success" />
            <StatCard label="Queued" value={String(statusCounts.queued)} detail="Waiting to run" icon={Clock3} tone="warning" />
            <StatCard label="Needs Approval" value={String(statusCounts.approval)} detail="Warnings or review gates" icon={ShieldCheck} tone="danger" />
            <StatCard label="Completed" value={String(statusCounts.completed)} detail="Completed task records" icon={CircleCheck} tone="purple" />
            <StatCard label="Runtime Tokens" value={formatBigNumber(tokenTotal)} detail={tokenTotal ? "From live task/runtime usage" : "No token usage reported"} icon={Sparkles} tone="purple" />
          </StatGrid>

          <SearchToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks..."
            right={<ViewToggle value={view === "board" ? "board" : "list"} labels={["Board", "List"]} onChange={(value) => setView(value === "grid" ? "board" : "list")} />}
          >
            <ToolbarButton icon={Filter} label={`Filter: ${formatTaskFilterLabel(filter)}`} active={filter !== "all"} onClick={() => setFilter("all")} />
            <ToolbarButton icon={SlidersHorizontal} label={`Sort: ${formatTaskSortLabel(sort)}`} chevron onClick={() => setSort((current) => sortModes[(sortModes.indexOf(current) + 1) % sortModes.length])} />
            <ToolbarButton icon={Layers3} label="Group: Status" active disabled title="The board is grouped by status." />
          </SearchToolbar>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "queued", "running", "approval", "stalled", "completed", "cancelled"] as Array<"all" | TaskView["status"]>).map((id) => (
              <FilterChip
                key={id}
                label={formatTaskFilterLabel(id)}
                count={id === "all" ? tasks.length : statusCounts[id]}
                active={filter === id}
                tone={resolveTaskTone(id)}
                onClick={() => setFilter(id)}
              />
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState title="No tasks match your filters" description="Clear search or switch filters to inspect the current AgentOS task snapshot." />
          ) : view === "board" ? (
            <div className="grid gap-2.5 xl:grid-cols-3 min-[1600px]:grid-cols-6">
              {(["queued", "running", "approval", "stalled", "completed", "cancelled"] as TaskView["status"][]).map((status) => (
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

          <div className="grid gap-2.5 xl:grid-cols-2">
            <RecentTasksPanel tasks={tasks.slice(0, 5)} />
            <UnsupportedPanel
              title="Automation Controls"
              description="Task scheduling toggles, approval decisions, pause, and retry controls are not exposed by the current Operations backend. Existing live cancellation and mission dispatch remain enabled."
            />
          </div>
        </>
      }
      inspector={selectedTask ? <TaskInspector task={selectedTask} onAbort={() => abortTask(selectedTask)} /> : null}
    />
      <MissionDispatchDialog
        open={dispatchOpen}
        agent={null}
        defaultWorkspaceId={activeWorkspaceId}
        onOpenChange={setDispatchOpen}
        onSubmitted={refresh}
      />
    </>
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
            {formatTaskFilterLabel(status)}
          </h2>
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[0.62rem] text-slate-400">{tasks.length}</span>
        </div>
        <button className="text-slate-500" type="button" disabled title="Use Create Task to submit a mission through the supported dispatch flow.">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} selected={task.id === selectedId} onSelect={() => onSelect(task.id)} onAbort={() => onAbort(task)} />
        ))}
        <button
          type="button"
          disabled
          title="Inline column creation is disabled; use Create Task to submit a mission through the supported dispatch flow."
          className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs text-slate-500"
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
  const cancelEnabled = canCancelTask(task);
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
            <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" disabled title="Approval review decisions are not exposed by the current task API." onClick={(event) => event.stopPropagation()}>Review</Button>
            <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] border-rose-400/20 px-2 text-[0.7rem] text-rose-200" disabled title="Reject is not exposed by the current task API." onClick={(event) => event.stopPropagation()}>Reject</Button>
          </>
        ) : task.status === "running" ? (
          <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" disabled title="Pause is not exposed by the current task API." onClick={(event) => event.stopPropagation()}>
            <Pause className="mr-1.5 h-3 w-3" /> Pause
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="h-7 flex-1 rounded-[8px] px-2 text-[0.7rem]" onClick={(event) => { event.stopPropagation(); onSelect(); }}>
            <Play className="mr-1.5 h-3 w-3" /> Open
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="h-7 rounded-[8px] px-2"
          disabled={!cancelEnabled}
          title={cancelEnabled ? "Cancel this task through the supported abort action." : "This task status cannot be cancelled."}
          onClick={(event) => { event.stopPropagation(); onAbort(); }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function TaskListRow({ task, selected, onSelect, onAbort }: { task: TaskView; selected: boolean; onSelect: () => void; onAbort: () => void }) {
  const cancelEnabled = canCancelTask(task);
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
        "grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 text-left text-xs hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40",
        selected && "bg-blue-500/[0.08]"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{task.title}</span>
        <span className="mt-1 block truncate text-[0.68rem] text-slate-400">{task.agentName} · {task.category}</span>
      </span>
      <StatusBadge label={task.statusLabel} tone={task.statusTone} />
      <span className="w-24 text-right text-slate-400">{task.tokenLabel}</span>
      <Button
        variant="secondary"
        size="sm"
        className="h-7 rounded-[8px] px-2 text-[0.7rem]"
        disabled={!cancelEnabled}
        title={cancelEnabled ? "Cancel this task through the supported abort action." : "This task status cannot be cancelled."}
        onClick={(event) => { event.stopPropagation(); onAbort(); }}
      >
        Cancel
      </Button>
    </div>
  );
}

function TaskInspector({ task, onAbort }: { task: TaskView; onAbort: () => void }) {
  const cancelEnabled = canCancelTask(task);
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
          <Button variant="secondary" size="sm" className="h-7 rounded-[8px] px-2 text-[0.7rem]" disabled title="Task-to-agent messaging is not exposed from this inspector. Use the Agents page chat for direct messages.">Message</Button>
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
        <KeyValue label="Task Key" value={task.source?.key ?? "Not reported"} />
        <KeyValue label="Approvals" value={task.status === "approval" ? "Review required by task warnings" : "Not reported"} />
        <KeyValue label="Outputs / Files" value={`${task.artifactCount} files`} />
        <KeyValue label="Warnings" value={`${task.warningCount} warnings`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" className="h-8 rounded-[9px] bg-blue-500 text-xs text-white hover:bg-blue-400" disabled title="Task details are already shown in this inspector.">Open</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" disabled title="Pause is not exposed by the current task API.">Pause</Button>
        <Button variant="secondary" size="sm" className="h-8 rounded-[9px] text-xs" disabled title="Retry/run-again requires a supported replay contract for the original mission.">Run Again</Button>
        <Button variant="destructive" size="sm" className="h-8 rounded-[9px] text-xs" disabled={!cancelEnabled} title={cancelEnabled ? "Cancel this task through the supported abort action." : "This task status cannot be cancelled."} onClick={onAbort}>Cancel</Button>
      </div>
    </InspectorPanelFrame>
  );
}

function RecentTasksPanel({ tasks }: { tasks: TaskView[] }) {
  return (
    <SectionCard title="Recent Activity">
      {tasks.length === 0 ? (
        <EmptyState title="No task activity" description="No task records were reported in the current AgentOS snapshot." />
      ) : (
      <div className="divide-y divide-white/[0.06] px-3">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center justify-between gap-2 py-2.5 text-[0.68rem]">
            <span className="min-w-0 truncate text-slate-300">{task.title}</span>
            <span className="shrink-0 text-slate-500">{task.statusLabel}</span>
          </div>
        ))}
      </div>
      )}
    </SectionCard>
  );
}
