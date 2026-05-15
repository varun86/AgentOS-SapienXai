# OpenClaw Gateway Sync Audit

Date: 2026-05-16

This pass audited AgentOS against the current OpenClaw Gateway-first architecture and kept the compatibility boundary:

`UI -> API routes -> application services -> OpenClaw adapter/client -> OpenClaw Gateway or CLI fallback`

AgentOS remains the human operating layer. OpenClaw remains the source of truth for gateway state, agents, sessions, models, channels, skills, config, approvals, and runtime execution.

## Surfaces Checked

Sources checked:

- OpenClaw docs: `https://docs.openclaw.ai/gateway/protocol`
- OpenClaw repository: `https://github.com/openclaw/openclaw`
- OpenClaw source files from `main`:
  - `docs/gateway/protocol.md`
  - `src/gateway/methods/core-descriptors.ts`
  - `src/gateway/protocol/version.ts`
  - `src/gateway/protocol/schema/config.ts`
  - `src/gateway/protocol/schema/logs-chat.ts`
  - `src/gateway/protocol/schema/sessions.ts`
  - `src/gateway/protocol/schema/agents-models-skills.ts`

Current source expectation:

- Gateway protocol version: `4`
- Gateway discovery source: `hello-ok.features.methods` and `hello-ok.features.events`
- Current method names include `health`, `status`, `models.list`, `models.authStatus`, `agents.list/create/update/delete`, `sessions.list/create/send/abort/subscribe/messages.subscribe`, `chat.history/send/abort`, `channels.status/start/stop/logout`, `skills.status/search/detail/install/update`, `plugins.uiDescriptors`, `config.get/set/schema/schema.lookup/patch/apply`, `exec.approval.*`, `plugin.approval.*`, `update.status`, `update.run`, and `gateway.restart.*`.

Local installed OpenClaw observed during the audit: `2026.5.12 (f066dd2)`.

Latest OpenClaw source observed during the audit: `2026.5.16`.

## Gateway-First Now

AgentOS now prefers native Gateway RPC for these operations when the Gateway is reachable and the RPC contract is usable:

- Gateway health/status read: `health` and `status`
- Model status/list: `models.authStatus` and `models.list`
- Agent list/delete: `agents.list` and `agents.delete`
- Sessions list: `sessions.list`
- Mission dispatch: `chat.send`, with `sessions.send` fallback before CLI fallback
- Mission abort: `sessions.abort`, with `chat.abort` fallback before CLI fallback
- Channel status: `channels.status`
- Skills/plugins catalog reads: `skills.status` and `plugins.uiDescriptors`
- Config reads/schema/mutations: `config.get`, `config.schema`, `config.patch`, `config.apply`, and legacy `config.set` only when safe
- Persistent runtime events: Gateway WebSocket plus `sessions.subscribe` and `sessions.messages.subscribe`

Capability detection now probes the native Gateway handshake and reads advertised methods/events from `hello-ok.features`. Diagnostics/settings continue to expose the capability matrix, including OpenClaw version, protocol version, auth mode, supported methods, config support, chat/event support, channel support, skills support, approval support, update support, native mission support, native agent lifecycle support, and fallback diagnostics.

## CLI Fallback Still Required

The CLI fallback remains intentional for:

- Install, setup, onboarding, recovery, doctor, and invalid-config repair flows.
- Gateway process control: start/stop/restart still uses CLI because the Gateway cannot fully control its own process lifecycle from an unavailable or restarting state.
- `models.scan`, because the current Gateway source does not expose a native `models.scan` method.
- Gateway probe/discovery helpers, because the current supported native read surface is `health`/`status`; CLI `gateway probe` still provides broader reachability diagnostics.
- Agent creation, because current native `agents.create` does not cover AgentOS' existing custom `id`, `agentDir`, bindings, and workspace skill provisioning semantics without losing higher-level AgentOS metadata side effects.
- Agent update paths that touch AgentOS manifests, identity files, policy skill files, bootstrap files, or workspace metadata.
- Streaming chat transcript fallback where native session events are unavailable or older Gateways do not advertise compatible event subscriptions.
- Channel/provider provisioning and route discovery with side effects across OpenClaw config, channel registries, logs, session stores, and AgentOS managed surface records.
- Legacy planner/runtime compatibility paths that still depend on local OpenClaw state and CLI behavior.

## Config Safety

Config writes now prefer schema-aware Gateway operations:

- Read the current snapshot through `config.get`.
- Preserve `hash` as `baseHash` for concurrency protection.
- Probe `config.schema` when available.
- Prefer `config.patch` with a merge-patch `raw` payload.
- Fall back to `config.apply` with `baseHash` when patch is unavailable.
- Refuse to send full-config writes when the snapshot contains redacted OpenClaw secrets.
- Refuse direct writes of the `__OPENCLAW_REDACTED__` placeholder.
- Keep CLI `config set/unset` as the path-level fallback.

## Obsolete Names Avoided

The latest source does not confirm these older names as primary Gateway contracts for this pass:

- `gateway.status`
- `gateway.probe`
- `models.status`
- `models.scan`
- `skills.list`
- `plugins.list`
- `events.subscribe`
- `sessions.chat.send`
- `approvals.list`
- `approvals.respond`
- `updates.status`
- `updates.apply`

AgentOS now treats the current method names listed above as the native path and keeps CLI fallback for unsupported or older Gateway versions.

## Tests Added Or Updated

- Capability detection against current Gateway method/event names.
- Native Gateway handshake feature discovery.
- Gateway-first model auth/list normalization.
- Gateway-first mission dispatch path selection, including unknown capability discovery.
- Mission abort native path selection.
- Gateway session event subscription without legacy `events.subscribe`.
- Config patch payload shape with `baseHash`.
- Redacted secret write refusal.
- CLI fallback behavior when native Gateway responses are unsupported or malformed.

## Remaining Risks

- Native `agents.create` is intentionally not used for AgentOS agent creation until OpenClaw exposes or documents a contract that preserves AgentOS' `id`, `agentDir`, bindings, skills, and workspace metadata semantics.
- Direct streamed chat UI still depends on existing transcript/SSE compatibility paths when the Gateway event surface is unavailable or incomplete.
- Config merge-patch paths cannot represent array-index writes safely; those paths continue through CLI fallback.
- Some Gateway methods are available in source but not yet integrated because AgentOS does not add higher-level operator/workspace value there today, for example low-level `tools.*`, `agent.wait`, `sessions.preview`, device/node pairing APIs, and wizard RPCs.
- Local installed OpenClaw may lag latest source. Capability detection and CLI fallback are the compatibility guard for that skew.
