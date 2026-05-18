import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAgentChatAuthAction } from "@/lib/openclaw/chat-auth-actions";

test("agent chat auth action detects ChatGPT Codex reconnect messages", () => {
  const action = resolveAgentChatAuthAction(
    "Your ChatGPT/Codex session has expired. Reconnect ChatGPT, then retry model discovery or runtime verification. Run: openclaw models auth login --provider openai-codex --set-default",
    "openai/gpt-5.4-mini"
  );

  assert.equal(action?.provider, "openai-codex");
  assert.equal(action?.label, "ChatGPT");
});

test("agent chat auth action reads provider from OpenClaw auth command", () => {
  const action = resolveAgentChatAuthAction(
    "Authentication required. Run: openclaw models auth paste-token --provider=openrouter",
    "openrouter/anthropic/claude-sonnet-4.5"
  );

  assert.equal(action?.provider, "openrouter");
});

test("agent chat auth action falls back to the agent model provider", () => {
  const action = resolveAgentChatAuthAction(
    "Provider token expired with status 401. Please reconnect before retrying.",
    "anthropic/claude-sonnet-4.5"
  );

  assert.equal(action?.provider, "anthropic");
});

test("agent chat auth action maps Gemini model provider to Google", () => {
  const action = resolveAgentChatAuthAction(
    "Authentication failed. Sign in again before retrying this request.",
    "gemini/gemini-2.5-pro"
  );

  assert.equal(action?.provider, "google");
});

test("agent chat auth action ignores non-auth chat errors", () => {
  assert.equal(resolveAgentChatAuthAction("OpenClaw completed without returning a response.", "openai/gpt-5.4-mini"), null);
});
