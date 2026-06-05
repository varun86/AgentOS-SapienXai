import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearOpenClawCompatibilityReportCacheForTesting,
  generateOpenClawCompatibilityReport
} from "@/lib/openclaw/compat";
import { resolveOpenClawCompatibilityTarget } from "@/lib/openclaw/compat/targets";
import {
  OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS,
  OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS
} from "@/lib/openclaw/client/gateway-compatibility";
import { OPENCLAW_SUPPORTED_BASELINE_VERSION } from "@/lib/openclaw/versions";
import { FakeOpenClawGateway } from "@/tests/helpers/fake-openclaw-gateway";

afterEach(() => {
  clearOpenClawCompatibilityReportCacheForTesting();
});

test("compatibility report marks the stable advertised Gateway contract compatible", async () => {
  const gateway = createCompatibilityGateway([
    ...OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS,
    ...OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS
  ]);

  const report = await generateOpenClawCompatibilityReport({
    ...baseReportOptions(gateway),
    includeLiveShapeChecks: true
  });

  assert.equal(report.status, "compatible");
  assert.equal(report.openClaw.installedVersion, OPENCLAW_SUPPORTED_BASELINE_VERSION);
  assert.equal(report.gateway.protocolStatus, "compatible");
  assert.equal(report.gateway.capabilitySource, "gateway-advertised");
  assert.equal(report.capabilities.find((capability) => capability.id === "models")?.status, "supported");
  assert.equal(report.capabilities.find((capability) => capability.id === "cliFallback")?.status, "supported");
  assert.equal(report.contracts.find((check) => check.operation === "models")?.status, "ok");
  assert.equal(report.contracts.find((check) => check.operation === "models")?.responseShapeStatus, "valid");
  assert.ok(report.summary.nativeGatewayCoveragePercent > 50);
});

test("compatibility report uses version safe defaults when Gateway omits method metadata", async () => {
  const gateway = createCompatibilityGateway([], { advertiseMethods: false });

  const report = await generateOpenClawCompatibilityReport({
    ...baseReportOptions(gateway),
    includeLiveShapeChecks: false
  });

  assert.equal(report.gateway.capabilitySource, "version-default");
  assert.equal(report.capabilities.find((capability) => capability.id === "sessions")?.source, "version-default");
  assert.equal(report.capabilities.find((capability) => capability.id === "sessions")?.status, "supported");
  assert.equal(report.contracts.find((check) => check.operation === "models")?.nativeGatewaySupported, true);
});

test("compatibility report fails a required contract when live response shape drifts", async () => {
  const gateway = createCompatibilityGateway([
    ...OPENCLAW_GATEWAY_BASELINE_REQUIRED_METHODS,
    ...OPENCLAW_GATEWAY_BASELINE_OPTIONAL_METHODS
  ]);
  gateway.route("models.list", (_frame, context) => {
    context.respond({ unexpected: true });
  });

  const report = await generateOpenClawCompatibilityReport({
    ...baseReportOptions(gateway),
    includeLiveShapeChecks: true
  });
  const modelsContract = report.contracts.find((check) => check.operation === "models");

  assert.equal(report.status, "incompatible");
  assert.equal(modelsContract?.status, "failed");
  assert.equal(modelsContract?.responseShapeValid, false);
  assert.match(modelsContract?.suggestedRecovery ?? "", /response matches the contract/i);
});

function baseReportOptions(gateway: FakeOpenClawGateway) {
  return {
    target: {
      ...resolveOpenClawCompatibilityTarget({
        target: "test-gateway-stable",
        runtimeStartedBy: "ci"
      }),
      label: "OpenClaw stable test gateway"
    },
    installedVersion: OPENCLAW_SUPPORTED_BASELINE_VERSION,
    status: {
      runtimeVersion: OPENCLAW_SUPPORTED_BASELINE_VERSION,
      version: OPENCLAW_SUPPORTED_BASELINE_VERSION
    },
    gatewayStatus: {
      service: { loaded: true, label: "OpenClaw Gateway" },
      rpc: {
        ok: true,
        capability: "protocol v4",
        auth: {
          role: "operator",
          scopes: ["operator.read", "operator.write"],
          capability: "operator"
        }
      },
      gateway: {
        bindMode: "local",
        port: 18789,
        probeUrl: "ws://127.0.0.1:18789"
      }
    },
    cliAvailable: true,
    nativeClientOptions: {
      webSocketFactory: gateway.webSocketFactory,
      url: "ws://127.0.0.1:18789",
      token: "test-token",
      timeoutMs: 100
    },
    nativeTimeoutMs: 100
  };
}

function createCompatibilityGateway(
  methods: string[],
  options: { advertiseMethods?: boolean } = {}
) {
  const events = options.advertiseMethods === false
    ? []
    : ["chat", "agent", "session.message", "session.tool", "task", "task.updated", "task.completed"];
  const gateway = new FakeOpenClawGateway({
    protocol: 4,
    methods: options.advertiseMethods === false ? [] : methods,
    events,
    handshake: {
      type: "hello-ok",
      protocol: 4,
      server: { version: OPENCLAW_SUPPORTED_BASELINE_VERSION },
      features: {
        methods: options.advertiseMethods === false ? [] : methods,
        events
      },
      auth: { role: "operator", scopes: ["operator.read", "operator.write"] }
    }
  });

  gateway.route("models.list", (_frame, context) => context.respond({ models: [] }));
  gateway.route("models.authStatus", (_frame, context) => context.respond({ auth: { providers: [] } }));
  gateway.route("sessions.list", (_frame, context) => context.respond({ sessions: [] }));
  gateway.route("sessions.preview", (_frame, context) => context.respond({ messages: [], sessions: [] }));
  gateway.route("chat.history", (_frame, context) => context.respond({ messages: [] }));
  gateway.route("tasks.list", (_frame, context) => context.respond({ tasks: [] }));
  gateway.route("artifacts.list", (_frame, context) => context.respond({ artifacts: [] }));
  gateway.route("tools.catalog", (_frame, context) => context.respond({ tools: [] }));
  gateway.route("tools.effective", (_frame, context) => context.respond({ tools: [] }));
  gateway.route("exec.approval.list", (_frame, context) => context.respond({ approvals: [], pending: [] }));
  gateway.route("device.pair.list", (_frame, context) => context.respond({ pending: [], devices: [] }));
  gateway.route("devices.list", (_frame, context) => context.respond({ devices: [] }));
  gateway.route("cron.list", (_frame, context) => context.respond({ jobs: [] }));
  gateway.route("cron.status", (_frame, context) => context.respond({ enabled: false, jobs: 0 }));
  gateway.route("logs.tail", (_frame, context) => context.respond({ lines: [] }));

  return gateway;
}
