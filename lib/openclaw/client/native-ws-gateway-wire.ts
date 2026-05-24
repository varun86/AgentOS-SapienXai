import "server-only";

import { WebSocket as NodeWebSocket } from "ws";

import {
  type GatewayEventFrame,
  type GatewayResponseFrame,
  type WebSocketFactory,
  type WebSocketLike
} from "@/lib/openclaw/client/native-ws-gateway-types";
import {
  NativeGatewayError,
  NativeGatewayRequestError
} from "@/lib/openclaw/client/native-ws-gateway-errors";
import { createRequestId } from "@/lib/openclaw/client/native-ws-gateway-utils";

export function resolveWebSocketFactory(input?: WebSocketFactory): WebSocketFactory {
  const factory = input ?? resolveDefaultWebSocketFactory();

  if (!factory) {
    throw new NativeGatewayError("Native WebSocket is not available in this runtime.");
  }

  return factory;
}

export function resolveDefaultWebSocketFactory(): WebSocketFactory | undefined {
  if (
    typeof process !== "undefined" &&
    process.env.AGENTOS_PACKAGE_RUNTIME === "1" &&
    typeof globalThis.WebSocket === "function"
  ) {
    return globalThis.WebSocket as unknown as WebSocketFactory;
  }

  if (typeof process !== "undefined" && process.versions?.node) {
    return NodeWebSocket as unknown as WebSocketFactory;
  }

  return globalThis.WebSocket as unknown as WebSocketFactory | undefined;
}

export function addSocketListener(
  socket: WebSocketLike,
  eventName: "open" | "message" | "error" | "close",
  listener: (event: unknown) => void
) {
  if (socket.addEventListener && socket.removeEventListener) {
    socket.addEventListener(eventName, listener);
    return () => socket.removeEventListener?.(eventName, listener);
  }

  if (socket.on) {
    const wrappedListener = (...args: unknown[]) => {
      if (eventName === "close") {
        listener({
          code: typeof args[0] === "number" ? args[0] : undefined,
          reason: formatSocketCloseReasonArg(args[1])
        });
        return;
      }

      listener(args[0]);
    };

    socket.on(eventName, wrappedListener);
    return () => {
      if (socket.off) {
        socket.off(eventName, wrappedListener);
        return;
      }

      socket.removeListener?.(eventName, wrappedListener);
    };
  }

  const key = `on${eventName}` as "onopen" | "onmessage" | "onerror" | "onclose";
  const previous = socket[key];
  socket[key] = listener;

  return () => {
    if (socket[key] === listener) {
      socket[key] = previous ?? null;
    }
  };
}

export function formatSocketCloseReasonArg(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  }

  return undefined;
}

export function readSocketCloseReason(event: unknown) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const record = event as { code?: unknown; reason?: unknown };
  const code = typeof record.code === "number" ? record.code : null;
  const reason = typeof record.reason === "string" ? record.reason : "";

  return code ? `${code}${reason ? `: ${reason}` : ""}` : reason || null;
}

export function normalizeGatewayError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { message?: unknown; detail?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message : null;
    const detail = typeof record.detail === "string" ? record.detail : null;
    const code = typeof record.code === "string" ? record.code : null;

    return [code, message, detail].filter(Boolean).join(": ");
  }

  return "";
}

export function normalizeGatewayResponseFailure(frame: GatewayResponseFrame) {
  return (
    normalizeGatewayError(frame.error) ||
    frame.message ||
    frame.code ||
    "OpenClaw Gateway request failed."
  );
}

export function parseGatewayFrameData(data: unknown): GatewayResponseFrame | null {
  if (typeof data !== "string") {
    if (data instanceof ArrayBuffer) {
      data = new TextDecoder().decode(data);
    } else if (ArrayBuffer.isView(data)) {
      data = new TextDecoder().decode(data);
    } else {
      return null;
    }
  }

  try {
    return JSON.parse(data as string) as GatewayResponseFrame;
  } catch (error) {
    throw new NativeGatewayError("OpenClaw Gateway returned invalid JSON.", { cause: error });
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new NativeGatewayError("OpenClaw Gateway request was aborted.");
  }
}

export async function waitForSocketOpen(socket: WebSocketLike, timeoutMs: number, signal?: AbortSignal) {
  throwIfAborted(signal);

  if (socket.readyState === 1) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanupCallbacks: Array<() => void> = [];

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timer);
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
      signal?.removeEventListener("abort", onAbort);
      callback();
    };

    const timer = globalThis.setTimeout(() => {
      settle(() => reject(new NativeGatewayError("Timed out connecting to OpenClaw Gateway.")));
    }, timeoutMs);

    const onAbort = () => {
      settle(() => reject(new NativeGatewayError("OpenClaw Gateway request was aborted.")));
    };

    cleanupCallbacks.push(
      addSocketListener(socket, "open", () => settle(resolve)),
      addSocketListener(socket, "error", (event) =>
        settle(() => reject(new NativeGatewayError("Failed to connect to OpenClaw Gateway.", { cause: event })))
      ),
      addSocketListener(socket, "close", (event) =>
        settle(() =>
          reject(
            new NativeGatewayError(
              `OpenClaw Gateway closed before the connection was ready${readSocketCloseReason(event) ? ` (${readSocketCloseReason(event)})` : ""}.`
            )
          )
        )
      )
    );
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitForConnectChallenge(socket: WebSocketLike, timeoutMs: number, signal?: AbortSignal) {
  throwIfAborted(signal);

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanupCallbacks: Array<() => void> = [];

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timer);
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
      signal?.removeEventListener("abort", onAbort);
      callback();
    };

    const timer = globalThis.setTimeout(() => {
      settle(() => reject(new NativeGatewayError("OpenClaw Gateway connect challenge timed out.")));
    }, timeoutMs);

    const onAbort = () => {
      settle(() => reject(new NativeGatewayError("OpenClaw Gateway request was aborted.")));
    };

    cleanupCallbacks.push(
      addSocketListener(socket, "message", (event) => {
        try {
          const data = (event as { data?: unknown })?.data ?? event;
          const frame = parseGatewayFrameData(data) as GatewayEventFrame | null;

          if (frame?.type !== "event" || frame.event !== "connect.challenge") {
            return;
          }

          const nonce = (frame.payload as { nonce?: unknown } | null)?.nonce;

          if (typeof nonce !== "string" || !nonce.trim()) {
            settle(() => reject(new NativeGatewayError("OpenClaw Gateway connect challenge is missing a nonce.")));
            return;
          }

          settle(() => resolve(nonce.trim()));
        } catch (error) {
          settle(() => reject(error));
        }
      }),
      addSocketListener(socket, "close", (event) =>
        settle(() =>
          reject(
            new NativeGatewayError(
              `OpenClaw Gateway closed before the connect challenge${readSocketCloseReason(event) ? ` (${readSocketCloseReason(event)})` : ""}.`
            )
          )
        )
      )
    );
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
  cleanup: () => void;
  method: string;
  sent: boolean;
};

export function sendGatewayRequest<TPayload>(
  socket: WebSocketLike,
  pending: Map<string, PendingRequest>,
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal
) {
  throwIfAborted(signal);

  const id = createRequestId();

  return new Promise<TPayload>((resolve, reject) => {
    function cleanup() {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    function rejectRequest(error: unknown) {
      pending.delete(id);
      cleanup();
      reject(error);
    }

    function onAbort() {
      rejectRequest(new NativeGatewayError("OpenClaw Gateway request was aborted."));
    }

    const timer = globalThis.setTimeout(() => {
      rejectRequest(new NativeGatewayRequestError(`Timed out waiting for OpenClaw Gateway method "${method}".`, method, true));
    }, timeoutMs);

    pending.set(id, {
      resolve: (payload) => {
        cleanup();
        resolve(payload as TPayload);
      },
      reject: rejectRequest,
      timer,
      cleanup,
      method,
      sent: false
    });
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      socket.send(JSON.stringify({ type: "req", id, method, params }));
      const request = pending.get(id);
      if (request) {
        request.sent = true;
      }
    } catch (error) {
      rejectRequest(new NativeGatewayRequestError(`Failed to send OpenClaw Gateway method "${method}".`, method, false, { cause: error }));
    }
  });
}
