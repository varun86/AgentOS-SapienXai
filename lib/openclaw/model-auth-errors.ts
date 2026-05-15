export function isOpenAiCodexAuthRefreshFailure(output: string) {
  const normalized = output.trim();

  return (
    /OAuth token refresh failed for openai-codex/i.test(normalized) ||
    /OpenAI Codex token refresh failed\s*\(401\)/i.test(normalized) ||
    /refresh token has already been used to generate a new access token/i.test(normalized)
  );
}

export function isOpenAiCodexAuthRecoveryMessage(output: string) {
  const normalized = output.trim();

  return (
    /Your ChatGPT\/Codex session has expired/i.test(normalized) &&
    /models auth login --provider openai-codex/i.test(normalized)
  );
}

export function isOpenAiCodexAuthFailure(output: string) {
  return isOpenAiCodexAuthRefreshFailure(output) || isOpenAiCodexAuthRecoveryMessage(output);
}

export function isOpenAiCodexDiscoveryTimeout(output: string) {
  return /OpenClaw command timed out after \d+ seconds|Command exceeded \d+ seconds/i.test(output);
}

export function resolveOpenAiCodexAuthRecoveryMessage(command: string) {
  return [
    "Your ChatGPT/Codex session has expired. Reconnect ChatGPT, then retry model discovery or runtime verification.",
    `Run: ${command}`
  ].join(" ");
}

export function buildOpenAiCodexAuthLoginCommand(commandBin: string) {
  return `${quoteShellArg(commandBin)} models auth login --provider openai-codex --set-default`;
}

function quoteShellArg(value: string) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
