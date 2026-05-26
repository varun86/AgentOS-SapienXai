"use client";

import { useMemo, useState, type ReactNode } from "react";

import { MissionSidebar } from "@/components/mission-control/sidebar";
import { toast } from "@/components/ui/sonner";
import { useMissionControlData } from "@/hooks/use-mission-control-data";
import type { MissionControlSnapshot, WorkspaceRecord } from "@/lib/agentos/contracts";
import { cn } from "@/lib/utils";
import { OperationsTopBar } from "@/components/operations/operations-ui";

export type OperationsShellContext = {
  snapshot: MissionControlSnapshot;
  activeWorkspace: WorkspaceRecord | null;
  activeWorkspaceId: string | null;
  connectionState: "connecting" | "live" | "retrying";
  refresh: () => Promise<void>;
};

export function OperationsShell({
  initialSnapshot,
  children
}: {
  initialSnapshot: MissionControlSnapshot;
  children: (context: OperationsShellContext) => ReactNode;
}) {
  const { snapshot, connectionState, refresh, setSnapshot } = useMissionControlData(initialSnapshot);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    initialSnapshot.workspaces[0]?.id ?? null
  );
  const activeWorkspace = useMemo(
    () =>
      (activeWorkspaceId
        ? snapshot.workspaces.find((workspace) => workspace.id === activeWorkspaceId)
        : null) ??
      snapshot.workspaces[0] ??
      null,
    [activeWorkspaceId, snapshot.workspaces]
  );
  const resolvedWorkspaceId = activeWorkspace?.id ?? activeWorkspaceId;

  return (
    <div className="mission-shell relative min-h-screen overflow-hidden bg-[#030814] text-slate-100">
      <div className="mission-canvas-backdrop fixed inset-0 z-0">
        <div aria-hidden="true" className="mission-canvas-pattern absolute inset-0 z-0 opacity-60" />
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_54%_0%,rgba(37,99,235,0.16),transparent_32%),linear-gradient(180deg,rgba(2,6,17,0.12),rgba(2,6,17,0.58))]"
        />
      </div>

      <div className="fixed left-0 top-0 z-30 hidden h-[100dvh] w-[292px] lg:block">
        <MissionSidebar
          snapshot={snapshot}
          surfaceTheme="dark"
          activeWorkspaceId={resolvedWorkspaceId}
          requestedAgentAction={null}
          connectionState={connectionState}
          collapsed={false}
          modelManager={{
            runState: "idle",
            statusMessage: null,
            resultMessage: null,
            log: "",
            manualCommand: null,
            docsUrl: null,
            discoveredModels: [],
            systemReady: snapshot.diagnostics.health === "healthy"
          }}
          onToggleCollapsed={() => {}}
          onSelectWorkspace={setActiveWorkspaceId}
          onRefresh={refresh}
          onRunModelRefresh={() => toast.message("Model refresh is available from Mission Control setup.")}
          onRunModelDiscover={() => toast.message("Model discovery is available from Mission Control setup.")}
          onRunModelSetDefault={() => toast.message("Default model changes are not exposed on this page yet.")}
          onConnectModelProvider={(provider) => toast.message(`Open ${provider} setup from Mission Control to connect it.`)}
          onOpenModelSetup={() => toast.message("Model setup opens from Mission Control.")}
          onOpenAddModels={() => toast.message("Add Models opens from Mission Control.")}
          onOpenWorkspaceCreate={() => toast.message("Workspace creation opens from Mission Control.")}
          onEditWorkspace={() => toast.message("Workspace editing opens from Mission Control.")}
          onSnapshotChange={setSnapshot}
          onAgentCreatedVisible={() => {}}
        />
      </div>

      <main className={cn("relative z-20 min-h-screen px-4 py-5 sm:px-6 lg:pl-[316px] lg:pr-5")}>
        <div className="mx-auto flex w-full max-w-[1880px] flex-col gap-5">
          <OperationsTopBar snapshot={snapshot} connectionState={connectionState} />
          {children({
            snapshot,
            activeWorkspace,
            activeWorkspaceId: resolvedWorkspaceId,
            connectionState,
            refresh
          })}
        </div>
      </main>
    </div>
  );
}
