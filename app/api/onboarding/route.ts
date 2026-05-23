import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { NextResponse } from "next/server";
import { z } from "zod";

import { formatOpenClawCommand, resetOpenClawBinCache, resolveOpenClawBin } from "@/lib/openclaw/cli";
import { createDefaultOpenClawBinarySelection, writeOpenClawBinarySelection } from "@/lib/openclaw/binary-selection";
import { probeLocalGatewayStatus } from "@/lib/openclaw/client/local-gateway-probe";
import { settleAgentConfigFromStateFile } from "@/lib/openclaw/state/agent-config-payload";
import { openClawStateRootPath } from "@/lib/openclaw/state/paths";
import { isOpenClawSystemReady } from "@/lib/openclaw/readiness";
import {
  OPENCLAW_INSTALL_DOCS_URL,
  getOpenClawInstallCommand,
  getOpenClawLocalPrefix,
  getOpenClawLocalPrefixBinPath
} from "@/lib/openclaw/install";
import {
  clearMissionControlCaches,
  getMissionControlSnapshot,
  touchOpenClawRuntimeStateAccess
} from "@/lib/agentos/control-plane";
import {
  repairGatewayAuthForModelSetupSnapshot,
  resolveGatewayAuthSetupIssueFromSnapshot
} from "@/lib/openclaw/model-setup-recovery";
import {
  generateGatewayNativeAuthToken,
  repairGatewayNativeDeviceAccess,
  saveGatewayNativeAuthCredential
} from "@/lib/openclaw/application/settings-service";
import { redactErrorMessage, redactSecrets } from "@/lib/security/redaction";
import type {
  MissionControlSnapshot,
  OpenClawOnboardingPhase,
  OpenClawOnboardingStreamEvent
} from "@/lib/agentos/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  intent: z.literal("auto")
});

const docsUrl = OPENCLAW_INSTALL_DOCS_URL;
const commandTimeoutMs = 10 * 60 * 1000;
const gatewayStatusTimeoutMs = 8_000;
const readyTimeoutMs = 25_000;
const postAuthRepairReadyTimeoutMs = 45_000;
const readyPollIntervalMs = 250;
const readySnapshotIntervalMs = 2_000;
type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorMessage?: string;
};

export async function POST(request: Request) {
  try {
    onboardingSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: redactErrorMessage(error, "Onboarding intent is required.")
      },
      { status: 400 }
    );
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let writeChain = Promise.resolve();
  let streamClosed = false;

  const send = (event: OpenClawOnboardingStreamEvent) => {
    const safeEvent = redactSecrets(event);
    if (streamClosed) {
      return Promise.resolve();
    }

    writeChain = writeChain
      .then(() => {
        if (streamClosed) {
          return;
        }

        return writer.write(encoder.encode(`${JSON.stringify(safeEvent)}\n`));
      })
      .catch(() => {});

    return writeChain;
  };

  const closeWriter = async () => {
    if (streamClosed) {
      return;
    }

    streamClosed = true;

    try {
      await writeChain;
    } catch {
      // Ignore late stream errors during shutdown.
    }

    try {
      await writer.close();
    } catch {
      // Ignore duplicate close attempts or a closed writer.
    }
  };

  void (async () => {
    let aggregatedStdout = "";
    let aggregatedStderr = "";
    let snapshot: MissionControlSnapshot | null = null;

    const appendOutput = (result: CommandResult) => {
      aggregatedStdout += result.stdout;
      aggregatedStderr += result.stderr;

      if (result.errorMessage) {
        aggregatedStderr = aggregatedStderr
          ? `${aggregatedStderr}\n${result.errorMessage}`
          : result.errorMessage;
      }
    };

    const fail = async (
      phase: OpenClawOnboardingPhase,
      message: string,
      options: {
        exitCode?: number | null;
        snapshot?: MissionControlSnapshot;
        manualCommand?: string;
        docsUrl?: string;
      } = {}
    ) => {
      await send({
        type: "done",
        ok: false,
        phase,
        message,
        exitCode: options.exitCode ?? null,
        stdout: aggregatedStdout,
        stderr: aggregatedStderr,
        snapshot: options.snapshot,
        manualCommand: options.manualCommand,
        docsUrl: options.docsUrl
      });
      await closeWriter();
    };

    const loadSnapshot = async (force = false): Promise<MissionControlSnapshot> => {
      if (force || !snapshot) {
        snapshot = force
          ? await getMissionControlSnapshot({ force: true, loadProfile: "system" })
          : await getMissionControlSnapshot();
      }

      return snapshot as MissionControlSnapshot;
    };

    try {
      await send({
        type: "status",
        phase: "detecting",
        message: "Checking local OpenClaw status..."
      });

      let resolveErrorMessage: string | null = null;
      let openClawBin = await resolveOpenClawBin().catch((error) => {
        resolveErrorMessage = redactErrorMessage(error, "OpenClaw CLI could not be resolved.");
        return null;
      });

      if (!openClawBin) {
        const installCommand = getOpenClawInstallCommand();

        if (process.platform === "win32") {
          const currentSnapshot = await loadSnapshot();

          aggregatedStderr = resolveErrorMessage || "OpenClaw CLI could not be resolved.";

          await fail("installing-cli", "OpenClaw CLI could not be resolved.", {
            snapshot: currentSnapshot,
            manualCommand: installCommand,
            docsUrl
          });
          return;
        }

        const installedOpenClawBin = await installOpenClawCli(send, appendOutput, installCommand);

        if (!installedOpenClawBin) {
          const currentSnapshot = await loadSnapshot();

          aggregatedStderr = resolveErrorMessage
            ? aggregatedStderr
              ? `${resolveErrorMessage}\n${aggregatedStderr}`
              : resolveErrorMessage
            : aggregatedStderr;

          await fail("installing-cli", "OpenClaw CLI installation failed.", {
            snapshot: currentSnapshot,
            manualCommand: installCommand,
            docsUrl
          });
          return;
        }

        openClawBin = installedOpenClawBin;
      }

      const gatewayStatus = await readGatewayStatus(openClawBin);

      if (!gatewayStatus?.rpc?.ok && gatewayStatus && (await needsGatewayRegistrationRepair(gatewayStatus))) {
        await send({
          type: "status",
          phase: "installing-gateway",
          message: "Repairing the gateway registration..."
        });

        const gatewayInstallResult = await runCommand(
          openClawBin,
          ["gateway", "install", "--force", "--json"],
          send
        );
        appendOutput(gatewayInstallResult);

        if (gatewayInstallResult.errorMessage || gatewayInstallResult.timedOut || gatewayInstallResult.code !== 0) {
          await fail("installing-gateway", "Gateway installation failed.", {
            exitCode: gatewayInstallResult.code,
            manualCommand: formatOpenClawCommand(openClawBin, ["gateway", "install", "--force", "--json"])
          });
          return;
        }
      }

      if (!gatewayStatus?.rpc?.ok) {
        const readySnapshot = await loadSnapshot(true);

        if (isOpenClawReady(readySnapshot)) {
          await send({
            type: "done",
            ok: true,
            phase: "ready",
            message: "OpenClaw system setup is already complete.",
            exitCode: 0,
            stdout: aggregatedStdout,
            stderr: aggregatedStderr,
            snapshot: readySnapshot
          });
          await closeWriter();
          return;
        }
      }

      if (!gatewayStatus?.rpc?.ok) {
        await send({
          type: "status",
          phase: "starting-gateway",
          message: "Starting the local gateway service..."
        });

        let gatewayStartResult = await runCommand(openClawBin, ["gateway", "start", "--json"], send);
        appendOutput(gatewayStartResult);
        const gatewayStartPayload = parseGatewayCommandPayload(gatewayStartResult.stdout);
        const gatewayReportedNotLoaded = gatewayStartPayload?.result === "not-loaded";

        if (
          gatewayStartResult.errorMessage ||
          gatewayStartResult.timedOut ||
          gatewayStartResult.code !== 0 ||
          gatewayReportedNotLoaded
        ) {
          if (!gatewayStatus?.service?.loaded || gatewayReportedNotLoaded) {
            await send({
              type: "status",
              phase: "installing-gateway",
              message: "Gateway service is not loaded. Installing it, then retrying start..."
            });

            const gatewayInstallResult = await runCommand(
              openClawBin,
              ["gateway", "install", "--json"],
              send
            );
            appendOutput(gatewayInstallResult);
            const gatewayInstallPayload = parseGatewayCommandPayload(gatewayInstallResult.stdout);

            if (gatewayInstallResult.errorMessage || gatewayInstallResult.timedOut || gatewayInstallResult.code !== 0) {
              await fail("installing-gateway", "Gateway installation failed.", {
                exitCode: gatewayInstallResult.code,
                manualCommand: formatOpenClawCommand(openClawBin, ["gateway", "install", "--json"])
              });
              return;
            }

            if (gatewayInstallNeedsAgentOsTokenSync(gatewayInstallPayload)) {
              try {
                const tokenSyncResult = await syncGatewayAuthTokenBeforeFirstStart(openClawBin, send);
                appendOutput(tokenSyncResult.modeResult);
                appendOutput(tokenSyncResult.tokenResult);
                aggregatedStdout = appendLine(
                  aggregatedStdout,
                  "AgentOS aligned Gateway token auth before first Gateway start."
                );
              } catch (error) {
                const recoveryMessage = redactErrorMessage(
                  error,
                  "AgentOS could not align Gateway token auth before first Gateway start."
                );
                aggregatedStderr = appendLine(aggregatedStderr, recoveryMessage);
                await fail("installing-gateway", recoveryMessage, {
                  manualCommand: formatOpenClawCommand(openClawBin, ["gateway", "status", "--json"])
                });
                return;
              }
            }

            await send({
              type: "status",
              phase: "starting-gateway",
              message: "Starting the local gateway service after installation..."
            });

            gatewayStartResult = await runCommand(openClawBin, ["gateway", "start", "--json"], send);
            appendOutput(gatewayStartResult);
          }

          if (gatewayStartResult.errorMessage || gatewayStartResult.timedOut || gatewayStartResult.code !== 0) {
            await fail("starting-gateway", "Gateway failed to start.", {
              exitCode: gatewayStartResult.code,
              manualCommand: formatOpenClawCommand(openClawBin, ["gateway", "start", "--json"])
            });
            return;
          }
        }

      }

      snapshot = await loadSnapshot(true);
      let repairedGatewayAuthKind: "gateway-token" | "device-access" | null = null;

      if (!isOpenClawReady(snapshot)) {
        try {
          const repairedGatewayMode = await repairGatewayModeIfNeeded(openClawBin, send, appendOutput);

          if (repairedGatewayMode) {
            snapshot = await loadSnapshot(true);
          }
        } catch (error) {
          const recoveryMessage = redactErrorMessage(error, "Gateway local mode repair failed during system setup.");
          aggregatedStderr = appendLine(aggregatedStderr, recoveryMessage);
          await fail("verifying", recoveryMessage, {
            snapshot,
            manualCommand: `${formatOpenClawCommand(openClawBin, ["config", "set", "gateway.mode", "local"])} && ${formatOpenClawCommand(openClawBin, ["gateway", "restart", "--force", "--json"])}`
          });
          return;
        }
      }

      if (!isOpenClawReady(snapshot)) {
        try {
          const repairedGatewayAuth = await repairGatewayAuthForSystemSetup(snapshot, send);

          if (repairedGatewayAuth) {
            repairedGatewayAuthKind = repairedGatewayAuth.kind;
            aggregatedStdout = appendLine(
              aggregatedStdout,
              repairedGatewayAuth.kind === "gateway-token"
                ? "AgentOS repaired local Gateway token auth for system setup."
                : "AgentOS repaired local Gateway device access for system setup."
            );
            clearMissionControlCaches();
            try {
              snapshot = await waitForReadySnapshotAfterGatewayAuthRepair(
                openClawBin,
                repairedGatewayAuth.kind,
                send,
                appendOutput
              );
            } catch (error) {
              aggregatedStderr = appendLine(
                aggregatedStderr,
                redactErrorMessage(error, "Gateway auth repair readiness wait failed.")
              );
              const fallbackSnapshot = await loadSnapshot(true).catch(() => null);
              if (fallbackSnapshot) {
                snapshot = fallbackSnapshot;
              }
            }
          }
        } catch (error) {
          const recoveryMessage = redactErrorMessage(error, "Gateway auth repair failed during system setup.");
          aggregatedStderr = appendLine(aggregatedStderr, recoveryMessage);
          await fail("verifying", recoveryMessage, {
            snapshot,
            manualCommand: formatOpenClawCommand(openClawBin, ["gateway", "status", "--json"])
          });
          return;
        }
      }

      if (!isOpenClawReady(snapshot)) {
        await send({
          type: "status",
          phase: "verifying",
          message: "Waiting for AgentOS to detect a live OpenClaw gateway..."
        });

        try {
          const verificationGatewayStatus = await readGatewayStatus(openClawBin).catch(() => gatewayStatus);
          snapshot = await waitForReadySnapshot(verificationGatewayStatus);
        } catch (error) {
          const gatewayStatusRetry = await readGatewayStatus(openClawBin);
          const gatewayModeBlocked = needsGatewayModeLocalRepair(gatewayStatusRetry);
          const latestSnapshot = await loadSnapshot(true).catch(() => snapshot);
          const gatewayAuthIssue = latestSnapshot
            ? resolveGatewayAuthSetupIssueFromSnapshot(latestSnapshot)
            : null;
          aggregatedStderr = appendLine(
            aggregatedStderr,
            redactErrorMessage(error, "Gateway verification failed.")
          );

          if (gatewayStatusRetry?.rpc?.error) {
            aggregatedStderr = appendLine(aggregatedStderr, gatewayStatusRetry.rpc.error);
          }

          if (!gatewayModeBlocked && gatewayAuthIssue && !repairedGatewayAuthKind && latestSnapshot) {
            try {
              const repairedGatewayAuth = await repairGatewayAuthForSystemSetup(latestSnapshot, send);

              if (repairedGatewayAuth) {
                repairedGatewayAuthKind = repairedGatewayAuth.kind;
                aggregatedStdout = appendLine(
                  aggregatedStdout,
                  repairedGatewayAuth.kind === "gateway-token"
                    ? "AgentOS repaired local Gateway token auth during system setup verification."
                    : "AgentOS repaired local Gateway device access during system setup verification."
                );
                clearMissionControlCaches();
                snapshot = await waitForReadySnapshotAfterGatewayAuthRepair(
                  openClawBin,
                  repairedGatewayAuth.kind,
                  send,
                  appendOutput
                );
              }
            } catch (repairError) {
              aggregatedStderr = appendLine(
                aggregatedStderr,
                redactErrorMessage(repairError, "Gateway auth repair failed during system setup verification.")
              );
            }
          }

          if (!snapshot || !isOpenClawReady(snapshot)) {
            await fail(
              "verifying",
              gatewayModeBlocked
                ? "OpenClaw gateway needs local mode enabled before AgentOS can connect."
                : gatewayAuthIssue && repairedGatewayAuthKind
                  ? buildGatewayAuthRepairStillPendingMessage(repairedGatewayAuthKind, "system setup")
                  : gatewayAuthIssue
                    ? "OpenClaw Gateway auth changed while AgentOS was verifying system setup. AgentOS attempted automatic repair but OpenClaw did not become ready in time."
                    : "OpenClaw did not become ready in time.",
              {
                snapshot: latestSnapshot ?? snapshot ?? undefined,
                manualCommand: gatewayModeBlocked
                  ? `${formatOpenClawCommand(openClawBin, ["config", "set", "gateway.mode", "local"])} && ${formatOpenClawCommand(openClawBin, ["gateway", "restart", "--force", "--json"])}`
                  : formatOpenClawCommand(openClawBin, ["gateway", "status", "--json"])
              }
            );
            return;
          }
        }
      }

      try {
        await send({
          type: "status",
          phase: "verifying",
          message: "Verifying runtime state access..."
        });

        const runtimeAgentId = await resolveRuntimeAgentIdFromState();
        await touchOpenClawRuntimeStateAccess({
          agentId: runtimeAgentId
        });

        snapshot = await loadSnapshot(true);
      } catch (error) {
        aggregatedStderr = aggregatedStderr
          ? `${aggregatedStderr}\n${redactErrorMessage(error, "Runtime state verification failed.")}`
          : redactErrorMessage(error, "Runtime state verification failed.");

        await fail(
          "verifying",
          "OpenClaw is online, but AgentOS cannot write to the OpenClaw runtime state yet.",
          {
            snapshot: snapshot ?? (await loadSnapshot(true))
          }
        );
        return;
      }

      await send({
        type: "done",
        ok: true,
        phase: "ready",
        message: "OpenClaw system setup is ready. Continue to model setup.",
        exitCode: 0,
        stdout: aggregatedStdout,
        stderr: aggregatedStderr,
        snapshot
      });
      await closeWriter();
    } catch (error) {
      aggregatedStderr = aggregatedStderr
        ? `${aggregatedStderr}\n${redactErrorMessage(error, "Unexpected onboarding failure.")}`
        : redactErrorMessage(error, "Unexpected onboarding failure.");

      await fail("detecting", "OpenClaw onboarding failed unexpectedly.");
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function runCommand(
  command: string,
  args: string[],
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>,
  options: {
    timeoutMs?: number;
  } = {}
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let resolved = false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? commandTimeoutMs);

    const finish = (result: CommandResult) => {
      if (resolved) {
        return;
      }

      resolved = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      void send({
        type: "log",
        stream: "stdout",
        text
      });
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      void send({
        type: "log",
        stream: "stderr",
        text
      });
    });

    child.on("error", (error) => {
      finish({
        code: null,
        stdout,
        stderr,
        timedOut,
        errorMessage: error.message
      });
    });

    child.on("close", (code) => {
      finish({
        code,
        stdout,
        stderr,
        timedOut,
        errorMessage: timedOut ? `Command exceeded ${Math.round(commandTimeoutMs / 1000)} seconds.` : undefined
      });
    });
  });
}

async function installOpenClawCli(
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>,
  appendOutput: (result: CommandResult) => void,
  installCommand: string
) {
  await send({
    type: "status",
    phase: "installing-cli",
    message: `Installing OpenClaw into ${getOpenClawLocalPrefix()}...`
  });

  const installResult = await runCommand("bash", ["-lc", installCommand], send);
  appendOutput(installResult);

  if (installResult.errorMessage || installResult.timedOut || installResult.code !== 0) {
    return null;
  }

  await writeOpenClawBinarySelection({
    ...createDefaultOpenClawBinarySelection(),
    mode: "local-prefix",
    path: getOpenClawLocalPrefixBinPath(),
    resolvedPath: getOpenClawLocalPrefixBinPath(),
    label: "Local prefix",
    detail: getOpenClawLocalPrefixBinPath()
  });
  resetOpenClawBinCache();

  try {
    return await resolveOpenClawBin();
  } catch {
    return null;
  }
}

async function syncGatewayAuthTokenBeforeFirstStart(
  openClawBin: string,
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>
) {
  await send({
    type: "status",
    phase: "installing-gateway",
    message: "Preparing Gateway auth for AgentOS before first start..."
  });

  const token = randomBytes(32).toString("base64url");
  const modeResult = await runCommand(openClawBin, ["config", "set", "gateway.auth.mode", "token"], send);

  if (modeResult.errorMessage || modeResult.timedOut || modeResult.code !== 0) {
    throw new Error("AgentOS could not set OpenClaw gateway.auth.mode=token.");
  }

  const tokenResult = await runCommand(openClawBin, ["config", "set", "gateway.auth.token", token], send);

  if (tokenResult.errorMessage || tokenResult.timedOut || tokenResult.code !== 0) {
    throw new Error("AgentOS could not write a fresh OpenClaw Gateway token.");
  }

  await saveGatewayNativeAuthCredential({
    kind: "token",
    value: token
  });
  clearMissionControlCaches();

  return {
    modeResult,
    tokenResult
  };
}

async function resolveRuntimeAgentIdFromState() {
  const agentConfig = await settleAgentConfigFromStateFile(openClawStateRootPath);

  if (agentConfig.status !== "fulfilled") {
    return null;
  }

  return agentConfig.value.find((agent) => typeof agent.id === "string" && agent.id.trim())?.id ?? null;
}

async function waitForReadySnapshot(
  gatewayStatus?: GatewayStatusPayload | null,
  options: { timeoutMs?: number } = {}
) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? readyTimeoutMs;
  const gatewayPort = gatewayStatus?.gateway?.port;
  let latestSnapshot: MissionControlSnapshot | null = null;
  let lastSnapshotAt = 0;

  const loadReadinessSnapshot = async () => {
    latestSnapshot = await getMissionControlSnapshot({ force: true, loadProfile: "system" });
    lastSnapshotAt = Date.now();

    if (isOpenClawReady(latestSnapshot)) {
      return latestSnapshot;
    }

    return null;
  };

  if ((await probeLocalGatewayStatus(gatewayPort))?.rpc?.ok) {
    const readySnapshot = await loadReadinessSnapshot();

    if (readySnapshot) {
      return readySnapshot;
    }
  }

  const immediateSnapshot = await loadReadinessSnapshot();

  if (immediateSnapshot) {
    return immediateSnapshot;
  }

  while (Date.now() - startedAt < timeoutMs) {
    const localProbe = await probeLocalGatewayStatus(gatewayPort);
    const shouldReloadSnapshot =
      Boolean(localProbe?.rpc?.ok) ||
      !latestSnapshot ||
      Date.now() - lastSnapshotAt >= readySnapshotIntervalMs;

    if (shouldReloadSnapshot) {
      const readySnapshot = await loadReadinessSnapshot();

      if (readySnapshot) {
        return readySnapshot;
      }
    }

    await delay(readyPollIntervalMs);
  }

  throw new Error(`Readiness check exceeded ${Math.round(timeoutMs / 1000)} seconds.`);
}

function isOpenClawReady(snapshot: MissionControlSnapshot) {
  return isOpenClawSystemReady(snapshot);
}

async function repairGatewayModeIfNeeded(
  openClawBin: string,
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>,
  appendOutput: (result: CommandResult) => void
) {
  const gatewayStatus = await readGatewayStatus(openClawBin);

  if (!needsGatewayModeLocalRepair(gatewayStatus)) {
    return false;
  }

  await send({
    type: "status",
    phase: "starting-gateway",
    message: "Configuring OpenClaw gateway for local AgentOS access..."
  });

  const setModeResult = await runCommand(openClawBin, ["config", "set", "gateway.mode", "local"], send);
  appendOutput(setModeResult);

  if (setModeResult.errorMessage || setModeResult.timedOut || setModeResult.code !== 0) {
    throw new Error("AgentOS could not set gateway.mode=local automatically.");
  }

  await send({
    type: "status",
    phase: "starting-gateway",
    message: "Restarting the local gateway service with gateway.mode=local..."
  });

  const restartResult = await runCommand(openClawBin, ["gateway", "restart", "--force", "--json"], send);
  appendOutput(restartResult);

  if (restartResult.errorMessage || restartResult.timedOut || restartResult.code !== 0) {
    throw new Error("AgentOS updated gateway.mode, but the gateway restart failed.");
  }

  return true;
}

async function repairGatewayAuthForSystemSetup(
  snapshot: MissionControlSnapshot,
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>
) {
  return repairGatewayAuthForModelSetupSnapshot(snapshot, {
    operationLabel: "system setup readiness",
    onStatus: async (message) => {
      await send({
        type: "status",
        phase: "verifying",
        message
      });
    },
    repairGatewayAuth: async (kind) => {
      if (kind === "gateway-token") {
        return generateGatewayNativeAuthToken({
          verifyDelaysMs: [0, 750, 1_500, 3_000]
        });
      }

      return repairGatewayNativeDeviceAccess();
    }
  });
}

async function waitForReadySnapshotAfterGatewayAuthRepair(
  openClawBin: string,
  kind: "gateway-token" | "device-access",
  send: (event: OpenClawOnboardingStreamEvent) => Promise<unknown>,
  appendOutput: (result: CommandResult) => void
) {
  await send({
    type: "status",
    phase: "verifying",
    message: kind === "gateway-token"
      ? "Gateway token repaired. Waiting for OpenClaw Gateway to reconnect..."
      : "Gateway device access repaired. Waiting for OpenClaw Gateway to reconnect..."
  });

  clearMissionControlCaches();
  await delay(750);

  await send({
    type: "status",
    phase: "starting-gateway",
    message: "Restarting the local Gateway service after auth repair..."
  });

  const restartResult = await runCommand(openClawBin, ["gateway", "restart", "--force", "--json"], send, {
    timeoutMs: 30_000
  });
  appendOutput(restartResult);

  if (restartResult.errorMessage || restartResult.timedOut || restartResult.code !== 0) {
    await send({
      type: "status",
      phase: "starting-gateway",
      message: "Gateway restart did not complete. Trying to start the local Gateway service..."
    });

    const startResult = await runCommand(openClawBin, ["gateway", "start", "--json"], send, {
      timeoutMs: 30_000
    });
    appendOutput(startResult);
  }

  clearMissionControlCaches();
  await delay(1_000);

  const gatewayStatus = await readGatewayStatus(openClawBin).catch(() => null);
  return waitForReadySnapshot(gatewayStatus, {
    timeoutMs: postAuthRepairReadyTimeoutMs
  });
}

function buildGatewayAuthRepairStillPendingMessage(
  kind: "gateway-token" | "device-access" | null,
  operationLabel: string
) {
  if (kind === "device-access") {
    return `AgentOS repaired local device access, but OpenClaw did not accept ${operationLabel} before the readiness timeout. AgentOS restarted the Gateway; run agentos doctor, then retry setup if this remains blocked.`;
  }

  return `AgentOS repaired the local Gateway token and restarted OpenClaw, but OpenClaw did not accept ${operationLabel} before the readiness timeout. Run agentos doctor, then retry setup if this remains blocked.`;
}

function appendLine(base: string, line: string) {
  const cleanLine = redactErrorMessage(line, "Gateway setup diagnostic was unavailable.");

  if (!cleanLine.trim()) {
    return base;
  }

  return base ? `${base}\n${cleanLine}` : cleanLine;
}

async function readGatewayStatus(openClawBin: string): Promise<GatewayStatusPayload | null> {
  const localProbe = await probeLocalGatewayStatus();

  if (localProbe?.rpc?.ok) {
    return localProbe as GatewayStatusPayload;
  }

  const result = await runCommand(openClawBin, ["gateway", "status", "--json"], async () => {}, {
    timeoutMs: gatewayStatusTimeoutMs
  });

  if (result.errorMessage || result.timedOut || result.code !== 0) {
    return null;
  }

  return parseGatewayStatusPayload(result.stdout || result.stderr);
}

function needsGatewayModeLocalRepair(payload: GatewayStatusPayload | null) {
  if (!payload || payload.rpc?.ok) {
    return false;
  }

  const diagnosticText = [payload.lastError, payload.rpc?.error].filter(Boolean).join("\n");
  return /gateway\.mode=local|current:\s*unset|allow-unconfigured/i.test(diagnosticText);
}

async function needsGatewayRegistrationRepair(payload: GatewayStatusPayload | null) {
  if (!payload?.service?.loaded || payload.rpc?.ok) {
    return false;
  }

  const programArguments = payload.service.command?.programArguments;

  if (!Array.isArray(programArguments) || programArguments.length < 2) {
    return true;
  }

  const pathArguments = programArguments
    .slice(0, 2)
    .filter((value): value is string => typeof value === "string" && value.includes("/"));

  if (pathArguments.length === 0) {
    return false;
  }

  for (const candidate of pathArguments) {
    if (!(await pathExists(candidate))) {
      return true;
    }
  }

  const diagnosticText = [payload.lastError, payload.rpc?.error].filter(Boolean).join("\n");

  return (
    payload.service.runtime?.status !== "running" &&
    /cannot find module|command not found|explicit credentials|no such file or directory/i.test(diagnosticText)
  );
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

type GatewayCommandPayload = {
  result?: string;
  ok?: boolean;
  message?: string;
  warnings?: string[];
};

type GatewayStatusPayload = {
  lastError?: string;
  service?: {
    loaded?: boolean;
    command?: {
      programArguments?: string[];
    };
    runtime?: {
      status?: string;
    };
  };
  gateway?: {
    port?: number;
  };
  rpc?: {
    ok?: boolean;
    error?: string;
  };
};

function parseGatewayCommandPayload(stdout: string): GatewayCommandPayload | null {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as GatewayCommandPayload;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as GatewayCommandPayload;
    } catch {
      return null;
    }
  }
}

function gatewayInstallNeedsAgentOsTokenSync(payload: GatewayCommandPayload | null) {
  if (!payload || payload.result !== "installed") {
    return false;
  }

  const text = [
    payload.message,
    ...(Array.isArray(payload.warnings) ? payload.warnings : [])
  ].filter(Boolean).join("\n");

  return /No gateway token found|Auto-generated one and saving to config/i.test(text);
}

function parseGatewayStatusPayload(stdout: string): GatewayStatusPayload | null {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as GatewayStatusPayload;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as GatewayStatusPayload;
    } catch {
      return null;
    }
  }
}
