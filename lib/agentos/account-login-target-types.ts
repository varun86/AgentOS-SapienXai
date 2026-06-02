export type AccountLoginTargetStatus = "manual_verification_needed";

export type AccountLoginTargetView = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspacePath: string | null;
  serviceId: string;
  serviceName: string;
  primaryDomain: string;
  loginUrl: string;
  browserProfileName: string;
  status: AccountLoginTargetStatus;
  statusLabel: string;
  statusTone: "warning";
  source: "agentos.connect-account";
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  openCount: number;
};

export type AccountLoginTargetsResponse = {
  ok: boolean;
  generatedAt: string;
  source: "agentos.account-login-targets";
  targets: AccountLoginTargetView[];
  error?: string;
};
