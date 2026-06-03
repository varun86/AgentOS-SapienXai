"use client";

import { useEffect, useState } from "react";

import type {
  RuntimeOutputRecord,
  TaskDetailRecord,
  TaskDetailStreamEvent
} from "@/lib/agentos/contracts";

export function useInspectorRuntimeOutput(selectedRuntimeId: string | null) {
  const [runtimeOutput, setRuntimeOutput] = useState<RuntimeOutputRecord | null>(null);
  const [runtimeOutputError, setRuntimeOutputError] = useState<{
    runtimeId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedRuntimeId) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/runtimes/${encodeURIComponent(selectedRuntimeId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as RuntimeOutputRecord & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load runtime output.");
        }

        setRuntimeOutput(payload);
        setRuntimeOutputError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setRuntimeOutput(null);
        setRuntimeOutputError({
          runtimeId: selectedRuntimeId,
          message: error instanceof Error ? error.message : "Unable to load runtime output."
        });
      });

    return () => controller.abort();
  }, [selectedRuntimeId]);

  return {
    runtimeOutput,
    runtimeOutputError
  };
}

export function useInspectorTaskDetailStream({
  selectedTaskId,
  canStreamTaskDetail,
  selectedTaskDispatchId
}: {
  selectedTaskId: string | null;
  canStreamTaskDetail: boolean;
  selectedTaskDispatchId: string | null;
}) {
  const [taskDetail, setTaskDetail] = useState<TaskDetailRecord | null>(null);
  const [taskDetailError, setTaskDetailError] = useState<{
    taskId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedTaskId || !canStreamTaskDetail) {
      return;
    }

    const searchParams = new URLSearchParams();
    if (selectedTaskDispatchId) {
      searchParams.set("dispatchId", selectedTaskDispatchId);
    }
    const source = new EventSource(
      `/api/tasks/${encodeURIComponent(selectedTaskId)}/stream${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`
    );

    const handleTask = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as TaskDetailStreamEvent;

        if (payload.type !== "task") {
          return;
        }

        setTaskDetail(payload.detail);
        setTaskDetailError(null);
      } catch (error) {
        setTaskDetailError({
          taskId: selectedTaskId,
          message: error instanceof Error ? error.message : "Unable to parse task feed."
        });
      }
    };

    const handleTaskError = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as TaskDetailStreamEvent;

        if (payload.type === "error") {
          setTaskDetailError({
            taskId: selectedTaskId,
            message: payload.error
          });
        }
      } catch {
        setTaskDetailError({
          taskId: selectedTaskId,
          message: "Unable to load task detail."
        });
      }
    };

    source.addEventListener("task", handleTask as EventListener);
    source.addEventListener("task-error", handleTaskError as EventListener);
    source.onerror = () => {
      setTaskDetailError((current) =>
        current?.taskId === selectedTaskId
          ? current
          : {
              taskId: selectedTaskId,
              message: "Task feed disconnected. Reconnecting…"
            }
      );
    };

    return () => {
      source.removeEventListener("task", handleTask as EventListener);
      source.removeEventListener("task-error", handleTaskError as EventListener);
      source.close();
    };
  }, [selectedTaskId, canStreamTaskDetail, selectedTaskDispatchId]);

  return {
    taskDetail,
    taskDetailError
  };
}
