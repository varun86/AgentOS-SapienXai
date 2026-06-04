export {
  buildOpenClawCompatibilityReport,
  clearOpenClawCompatibilityReportCacheForTesting,
  generateOpenClawCompatibilityReport,
  getCachedOpenClawCompatibilityReport,
  getOpenClawCompatibilityReport,
  isOpenClawVersionAtLeastSupportedBaseline,
  warmOpenClawCompatibilityReport,
  type OpenClawCompatibilityReportOptions
} from "@/lib/openclaw/compat/report";
export {
  formatOpenClawCompatibilityReleaseSummary,
  formatOpenClawCompatibilityReportHuman
} from "@/lib/openclaw/compat/format";
export type {
  OpenClawCompatibilityCapability,
  OpenClawCompatibilityCapabilityId,
  OpenClawCompatibilityContractCheck,
  OpenClawCompatibilityContractStatus,
  OpenClawCompatibilityReport,
  OpenClawCompatibilityStatus,
  OpenClawCompatibilitySupportStatus,
  OpenClawGatewayHealthStatus,
  OpenClawGatewayProtocolCompatibilityStatus
} from "@/lib/openclaw/compat/types";
