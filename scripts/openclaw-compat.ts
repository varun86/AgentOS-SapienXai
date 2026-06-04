import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

import {
  OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS,
  OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS,
  OPENCLAW_KNOWN_GATEWAY_FIRST_METHODS
} from "@/lib/openclaw/client/gateway-compatibility";
import {
  formatOpenClawCompatibilityReleaseSummary,
  formatOpenClawCompatibilityReportHuman,
  getOpenClawCompatibilityReport
} from "@/lib/openclaw/compat";
import {
  OPENCLAW_RECOMMENDED_VERSION,
  OPENCLAW_SUPPORTED_BASELINE_VERSION
} from "@/lib/openclaw/versions";
import { redactSecrets } from "@/lib/security/redaction";

type CompatTarget = "local" | "test-gateway-stable" | "test-gateway-beta";

type CliOptions = {
  target: CompatTarget;
  jsonOutput: string | null;
  jsonOnly: boolean;
  failOnDegraded: boolean;
  noShapeChecks: boolean;
};

type GatewayFrame = {
  type?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const testGateway = options.target === "local" ? null : await startCompatibilityTestGateway(options.target);

  try {
    const report = redactSecrets(await getOpenClawCompatibilityReport({
      force: true,
      includeLiveShapeChecks: !options.noShapeChecks,
      ...(testGateway
        ? {
          target: {
            kind: "test-gateway" as const,
            label: testGateway.label,
            version: testGateway.version
          },
          installedVersion: testGateway.version,
          status: {
            runtimeVersion: testGateway.version,
            version: testGateway.version,
            updateChannel: testGateway.channel
          },
          gatewayStatus: {
            service: {
              label: testGateway.label,
              loaded: true
            },
            gateway: {
              bindMode: "local",
              port: testGateway.port,
              probeUrl: testGateway.url
            },
            rpc: {
              ok: true,
              capability: "protocol v4",
              auth: {
                role: "operator",
                scopes: ["operator.read", "operator.write"],
                capability: "operator"
              }
            }
          },
          cliAvailable: true,
          nativeClientOptions: {
            url: testGateway.url,
            token: "test-token",
            timeoutMs: 1_500
          },
          nativeTimeoutMs: 1_500
        }
        : {})
    }));
    const releaseSummary = formatOpenClawCompatibilityReleaseSummary(report);

    if (!options.jsonOnly) {
      process.stdout.write(formatOpenClawCompatibilityReportHuman(report));
    }

    const jsonPayload = JSON.stringify({ report, releaseSummary }, null, 2);

    if (options.jsonOutput) {
      const outputPath = path.resolve(options.jsonOutput);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${jsonPayload}\n`, "utf8");
      if (!options.jsonOnly) {
        process.stdout.write(`\nJSON report written to ${outputPath}\n`);
      }
    }

    if (options.jsonOnly) {
      process.stdout.write(`${jsonPayload}\n`);
    } else {
      process.stdout.write("\nOPENCLAW_COMPAT_REPORT_JSON_START\n");
      process.stdout.write(`${jsonPayload}\n`);
      process.stdout.write("OPENCLAW_COMPAT_REPORT_JSON_END\n");
    }

    if (report.status === "incompatible" || (options.failOnDegraded && report.status === "degraded")) {
      process.exitCode = 1;
    }
  } finally {
    await testGateway?.close();
  }
}

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = {
    target: "local",
    jsonOutput: null,
    jsonOnly: false,
    failOnDegraded: false,
    noShapeChecks: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--":
        break;
      case "--target": {
        const target = args[index + 1] as CompatTarget | undefined;
        if (!target || !["local", "test-gateway-stable", "test-gateway-beta"].includes(target)) {
          throw new Error("Expected --target local|test-gateway-stable|test-gateway-beta.");
        }
        parsed.target = target;
        index += 1;
        break;
      }
      case "--json-output":
      case "--output": {
        const output = args[index + 1];
        if (!output) {
          throw new Error(`Expected a file path after ${arg}.`);
        }
        parsed.jsonOutput = output;
        index += 1;
        break;
      }
      case "--json-only":
        parsed.jsonOnly = true;
        break;
      case "--fail-on-degraded":
        parsed.failOnDegraded = true;
        break;
      case "--no-shape-checks":
        parsed.noShapeChecks = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`Usage: pnpm openclaw:compat [options]

Options:
  --target <target>       local, test-gateway-stable, or test-gateway-beta
  --json-output <path>    write sanitized JSON report to a file
  --json-only             print only JSON
  --fail-on-degraded      exit non-zero on degraded or incompatible status
  --no-shape-checks       skip live response shape probes

Default target is local.
`);
}

async function startCompatibilityTestGateway(target: Exclude<CompatTarget, "local">) {
  const stableMethods = [
    ...OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS,
    ...OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS
  ];
  const methods = target === "test-gateway-beta"
    ? OPENCLAW_KNOWN_GATEWAY_FIRST_METHODS
    : stableMethods;
  const version = target === "test-gateway-beta"
    ? `${OPENCLAW_RECOMMENDED_VERSION}-beta`
    : OPENCLAW_SUPPORTED_BASELINE_VERSION;
  const channel = target === "test-gateway-beta" ? "beta" : "stable";
  const label = target === "test-gateway-beta"
    ? "OpenClaw latest beta test gateway"
    : `OpenClaw ${OPENCLAW_SUPPORTED_BASELINE_VERSION} stable test gateway`;
  const methodSet = new Set(methods);
  const events = ["chat", "agent", "session.message", "session.tool", "task", "task.updated", "task.completed"];
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });

  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as GatewayFrame;
      const id = frame.id;
      const method = frame.method;

      if (!id || !method) {
        return;
      }

      if (method === "connect") {
        send(socket, id, {
          type: "hello-ok",
          protocol: 4,
          server: { version },
          features: { methods, events },
          auth: { role: "operator", scopes: ["operator.read", "operator.write"] }
        });
        return;
      }

      if (!methodSet.has(method)) {
        fail(socket, id, `INVALID_REQUEST: unknown method: ${method}`);
        return;
      }

      send(socket, id, buildTestGatewayPayload(method, frame.params ?? {}, version));
    });
  });

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to bind compatibility test gateway.");
  }

  return {
    label,
    version,
    channel,
    port: address.port,
    url: `ws://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    })
  };
}

function send(socket: WebSocket, id: string | number, payload: unknown) {
  socket.send(JSON.stringify({ type: "res", id, ok: true, payload }));
}

function fail(socket: WebSocket, id: string | number, message: string) {
  socket.send(JSON.stringify({ type: "res", id, ok: false, error: { message } }));
}

function buildTestGatewayPayload(method: string, params: Record<string, unknown>, version: string) {
  switch (method) {
    case "health":
      return { ok: true };
    case "status":
      return { runtimeVersion: version, version };
    case "update.status":
      return { currentVersion: version, latestVersion: version, updateAvailable: false };
    case "models.list":
      return { models: [] };
    case "models.authStatus":
      return { auth: { providers: [] } };
    case "agents.list":
      return { agents: [] };
    case "sessions.list":
      return { sessions: [] };
    case "sessions.preview":
    case "chat.history":
      return { messages: [], sessions: [] };
    case "tasks.list":
      return { tasks: [] };
    case "artifacts.list":
      return { artifacts: [] };
    case "tools.catalog":
    case "tools.effective":
      return { tools: [] };
    case "plugins.list":
      return { plugins: [] };
    case "plugins.uiDescriptors":
      return { plugins: [], descriptors: [] };
    case "exec.approval.list":
      return { approvals: [], pending: [] };
    case "device.pair.list":
    case "devices.list":
      return { pending: [], devices: [] };
    case "cron.status":
      return { enabled: false, jobs: 0 };
    case "cron.list":
      return { jobs: [] };
    case "channels.status":
    case "channels.list":
      return { channels: {}, channelOrder: [], channelAccounts: {} };
    case "config.get":
      return { config: {}, hash: "test-gateway" };
    case "config.schema":
    case "config.schema.lookup":
      return { schema: { type: "object" } };
    case "logs.tail":
      return { lines: [], cursor: 0, size: 0 };
    case "skills.status":
      return { skills: [] };
    case "browser.request":
      return params.path === "/profiles" ? { profiles: [] } : { ok: true };
    default:
      return { ok: true, method };
  }
}
