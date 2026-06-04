import type {
  OpenClawCompatibilityContractCheck,
  OpenClawCompatibilityReport,
  OpenClawCompatibilityStatus
} from "@/lib/openclaw/compat/types";

export function formatOpenClawCompatibilityReportHuman(report: OpenClawCompatibilityReport) {
  const lines = [
    "OpenClaw Compatibility Report",
    `Generated: ${report.generatedAt}`,
    `Target: ${report.target.label}`,
    `Overall status: ${formatStatus(report.status)}`,
    `Reason: ${report.statusReason}`,
    "",
    "Versions",
    `  Installed OpenClaw: ${formatVersion(report.openClaw.installedVersion)}`,
    `  Recommended OpenClaw: ${formatVersion(report.openClaw.recommendedVersion)}`,
    `  Supported baseline: ${formatVersion(report.openClaw.supportedBaselineVersion)}`,
    `  Tested versions: ${report.openClaw.testedVersions.length ? report.openClaw.testedVersions.map(formatVersion).join(", ") : "not available"}`,
    "",
    "Gateway",
    `  Health: ${report.gateway.health} (${report.gateway.healthReason})`,
    `  Protocol: ${report.gateway.protocolVersion ? `v${report.gateway.protocolVersion}` : "unknown"} / ${report.gateway.protocolStatus}`,
    `  Protocol range: v${report.gateway.protocolRange.min}-v${report.gateway.protocolRange.max}`,
    `  Auth mode: ${report.gateway.authMode ?? "unknown"}`,
    `  Auth role: ${report.gateway.authRole ?? "unknown"}`,
    `  Capability source: ${report.gateway.capabilitySource}`,
    `  Advertised RPC methods: ${report.gateway.advertisedMethodCount}`,
    `  Effective RPC methods: ${report.gateway.effectiveMethodCount}`,
    "",
    "Release Metrics",
    `  Native Gateway coverage: ${report.summary.nativeGatewayCoveragePercent}% (${report.summary.nativeGatewayCoverageLabel})`,
    `  CLI fallback operation count: ${report.summary.cliFallbackOperationCount}`,
    `  Active CLI fallback count: ${report.summary.activeCliFallbackCount}`,
    `  Degraded surfaces: ${formatList(report.summary.degradedSurfaces)}`,
    `  Unsupported surfaces: ${formatList(report.summary.unsupportedSurfaces)}`,
    `  Failed surfaces: ${formatList(report.summary.failedSurfaces)}`,
    "",
    "Capabilities",
    ...report.capabilities.map((capability) =>
      `  ${capability.label}: ${capability.status} (${capability.source})`
    ),
    "",
    "Contract Checks",
    ...report.contracts.map(formatContractLine),
    "",
    `Recovery: ${report.recovery}`
  ];

  if (report.diagnostics.length > 0) {
    lines.push("", "Diagnostics", ...report.diagnostics.map((entry) => `  ${entry}`));
  }

  return `${lines.join("\n")}\n`;
}

export function formatOpenClawCompatibilityReleaseSummary(report: OpenClawCompatibilityReport) {
  return {
    nativeGatewayCoveragePercent: report.summary.nativeGatewayCoveragePercent,
    cliFallbackCount: report.summary.cliFallbackOperationCount,
    degradedSurfaces: report.summary.degradedSurfaces,
    supportedOpenClawVersion: report.summary.supportedOpenClawVersion,
    testedOpenClawVersions: report.summary.testedOpenClawVersions
  };
}

function formatContractLine(check: OpenClawCompatibilityContractCheck) {
  const fallback = check.cliFallbackAvailable ? "yes" : "no";
  const shape = check.responseShapeStatus === "not-checked"
    ? "not checked"
    : check.responseShapeValid
      ? "valid"
      : "invalid";
  const native = check.nativeGatewaySupported
    ? check.supportedMethod ?? check.supportedEvent ?? "yes"
    : "no";

  return `  ${check.label}: ${check.status} / native=${native} / fallback=${fallback} / shape=${shape}`;
}

function formatStatus(status: OpenClawCompatibilityStatus) {
  switch (status) {
    case "compatible":
      return "Compatible";
    case "degraded":
      return "Degraded";
    case "incompatible":
      return "Incompatible";
  }
}

function formatVersion(value: string | null) {
  return value ? `v${value.replace(/^v/i, "")}` : "not available";
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "none";
}
