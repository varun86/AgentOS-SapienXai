---
name: agentos
description: Use before and during AgentOS code, UX, integration, or release work so changes stay OpenClaw-first, observable, and release-safe.
---

# AgentOS Codex Skill

Use this skill for AgentOS changes. Keep it practical: inspect the current code first, use the existing OpenClaw boundary, and make the smallest change that improves real operator control.

## Product North Star

AgentOS is the human operating layer above OpenClaw. OpenClaw remains the backend, orchestration, runtime, agent/session/task/model/device/integration layer.

AgentOS must not become a replacement orchestrator or an OpenClaw clone. It should expose, visualize, manage, and improve UX around OpenClaw-backed workspaces, agents, tasks, files, models, integrations, policies, approvals, cost visibility, and runtime state.

Success question: did this system take a real workload from the owner today?

## Start Here

Before implementing, inspect the relevant local surfaces:

- Product and architecture: `README.md`, `docs/openclaw-sync-audit.md`, `docs/openclaw-gateway-first-migration.md`
- OpenClaw boundary: `lib/openclaw/client/`, `lib/openclaw/adapter/`, `lib/openclaw/application/`, `lib/openclaw/domains/`
- AgentOS state/contracts: `lib/agentos/`, `hooks/use-mission-control-data.ts`, `hooks/use-task-feed.ts`
- UI: `components/mission-control/`, `components/operations/`, `app/*/page.tsx`
- API routes: `app/api/`
- Release/install: `packages/agentos/package.json`, `packages/agentos/scripts/check-release-consistency.mjs`, `install.sh`, `install.ps1`, `.github/workflows/release-agentos.yml`
- Tests: `tests/`, especially OpenClaw boundary, gateway-first, release consistency, and CLI smoke tests

## OpenClaw-First Rules

- Check whether OpenClaw already provides the capability through Gateway RPC, SDK/config, CLI, session/task APIs, model APIs, integration APIs, or device APIs.
- Prefer native Gateway/API integration over CLI.
- Use CLI only when no stable native Gateway/API path exists, or for existing install, recovery, gateway process control, and unsupported Gateway operations.
- Any CLI fallback must be explicit, observable, and surfaced through diagnostics, logs, UI state, or returned metadata with reason and recovery path.
- Do not duplicate OpenClaw concepts unless AgentOS needs a UI projection, cache, adapter, or workspace-local sidecar.
- Keep AgentOS-specific state separate from OpenClaw runtime state.

Decision gate for new behavior:

- If OpenClaw owns it, add or reuse a typed Gateway/client/adapter path and cover fallback behavior.
- If OpenClaw supports it only through CLI today, isolate the CLI call in the existing OpenClaw service layer and expose fallback diagnostics.
- If AgentOS owns it, name the sidecar state explicitly and keep it out of OpenClaw runtime truth.
- If neither layer clearly owns it, stop and explain the product/architecture decision before coding.

## Gateway And Sync Rules

Respect the existing boundary:

`UI -> API routes -> application services -> OpenClaw adapter/client -> OpenClaw Gateway or CLI fallback`

- Centralize OpenClaw communication in typed clients, adapters, hooks, or services. Do not scatter ad hoc Gateway calls across components.
- Keep AgentOS and OpenClaw concepts synchronized for sessions, tasks, models, integrations, devices, approvals, and workspace agents.
- Validate lifecycle behavior against real OpenClaw behavior when touching sessions, tasks, models, integrations, or device approvals.
- Preserve capability detection and fallback diagnostics. If Gateway support is uncertain, make the degraded path visible.
- Never build fake "working" UI. Connect to real data, block the action, or mark it as placeholder/demo/sample.

## UI And UX Standards

AgentOS should feel like a premium operator console: dense, readable, operational, and calm.

- Every button works, is disabled with a reason, or is clearly marked coming soon.
- Every data-heavy page has loading, empty, error, and success states.
- Important state should be visible where relevant: Gateway status, OpenClaw version, native vs CLI usage, fallback reason, model/provider state, active sessions, running tasks, approval requirements, and integration health.
- Avoid mock analytics unless clearly labeled as demo/sample data.
- Keep fallback/demo snapshots explicit; never let sample data look like a healthy production runtime.
- Reuse existing components, layout patterns, design tokens, icons, and mission-control conventions before adding new UI primitives.
- Keep workflows ergonomic for repeated operator use; prefer clear status and actions over marketing copy.

## Code Quality Rules

- Keep TypeScript strict and typed. Avoid broad `any`; justify it locally if unavoidable.
- Reuse existing components, hooks, services, utilities, and domain helpers.
- Keep changes small, reviewable, and aligned with the current architecture.
- Avoid unnecessary abstractions, duplicated logic, dead buttons, silent failures, and hardcoded fake production data.
- Surface failures with actionable messages and recovery paths.
- Add or update focused tests when changing shared behavior, OpenClaw contracts, lifecycle logic, release tooling, or user-visible workflows.
- For OpenClaw boundary changes, prefer tests near `tests/openclaw-*-test.ts`, `tests/openclaw-gateway-first-contract.test.ts`, or the matching service test.
- Run the repo's relevant validation before finalizing: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm check:release` when release files are touched.

## Default Task Workflow

1. Understand the requested task and the user-visible outcome.
2. Inspect relevant codebase areas before editing.
3. Inspect existing OpenClaw integration, docs, and tests before inventing a new path.
4. Choose the correct source of truth: native Gateway/API, SDK/config, CLI fallback, or AgentOS-only state.
5. Make the smallest correct implementation.
6. Add or update tests where practical.
7. Run available validation commands.
8. Summarize what changed, what OpenClaw capability was used, whether CLI fallback remains, what validation passed or failed, and what still needs manual verification.

## Release Mode Checklist

Enter release mode only when the user asks for release preparation. Check and align:

- `packages/agentos/package.json` version, the published package source of truth
- Root `package.json` scripts and private workspace version expectations
- npm package metadata and lockfile consistency
- Before npm publish, load local publish credentials from `.env.local` without printing secret values; verify `NPM_TOKEN`/`NODE_AUTH_TOKEN` is present, then use a temporary npm userconfig that maps `//registry.npmjs.org/:_authToken` to that token before running `pnpm publish:agentos`
- GitHub release tag format: `agentos-v<version>`
- README and package README install commands and version examples
- `install.sh` and `install.ps1`
- `packages/agentos/scripts/check-release-consistency.mjs`
- `.github/workflows/release-agentos.yml`
- OpenClaw minimum/supported version notes and diagnostics copy
- Changelog or release notes, when present
- Website/download links if present in the repo
- Build output, lint/typecheck/test status, and npm dry-run or pack output when applicable

Do not publish, tag, push, or create a release unless the user explicitly asks. Prepare the changes and instructions instead.

## Anti-Drift Rules

Do not:

- Turn AgentOS into a separate OpenClaw clone.
- Create fake backend behavior just to make UI look complete.
- Hide CLI fallback or degraded Gateway behavior.
- Add concepts that do not support AgentOS' operator-control product goals.
- Rewrite large areas before proving the current structure is wrong.
- Create version or release mismatches between GitHub, npm, docs, installers, and workflows.
- Add Turkish project content or user-facing copy unless explicitly requested.


---

# Mandatory Operating Rules

## OpenClaw Compatibility Mode

When touching any OpenClaw-related integration, Codex must treat compatibility as a first-class requirement.

This applies to:
- Gateway client code
- CLI fallback code
- OpenClaw adapters
- OpenClaw application services
- Setup Center
- Settings / Diagnostics
- Models, auth profiles, accounts, browser profiles, sessions, tasks, transcripts, channels, tools, and config flows
- Release/version scripts that depend on OpenClaw versions

Rules:
- Never assume an OpenClaw method, field, event, or CLI command exists only because AgentOS UI needs it.
- Identify the exact OpenClaw capability being used before implementing or changing behavior.
- Prefer native OpenClaw Gateway/API paths whenever a stable path exists.
- Use CLI fallback only when no stable native Gateway/API path exists, and make the fallback explicit, observable, and recoverable.
- If Gateway support is missing, unstable, or uncertain, expose the feature as degraded, unsupported, or unavailable instead of pretending it works.
- Keep AgentOS UI dependent on AgentOS-normalized domain models, not raw OpenClaw response shapes.
- Do not spread OpenClaw calls directly into React components or unrelated API routes.
- Route OpenClaw access through the existing adapter/client/application-service boundary.
- Preserve compatibility with the recommended OpenClaw version defined in the repo.
- When practical, check behavior against latest stable OpenClaw and latest beta OpenClaw.
- If an OpenClaw response shape, lifecycle behavior, auth behavior, model discovery behavior, session/task behavior, or fallback behavior changes, add or update a contract test.
- If a feature cannot be connected to a real OpenClaw capability, do not leave mock/local/demo behavior behind.
- Show `unknown`, `not available`, `unsupported`, or `degraded` states honestly when runtime data is missing.
- Do not silently swallow OpenClaw errors. Convert them into useful diagnostics and recovery suggestions.
- Do not downgrade the architecture by making CLI fallback the default path.
- Do not duplicate OpenClaw functionality inside AgentOS unless explicitly needed as a UI/control-layer abstraction.

Compatibility checks should report:
- Installed OpenClaw version
- Recommended OpenClaw version
- Gateway availability
- Gateway protocol compatibility
- Native Gateway/API supported operations
- CLI fallback operations
- Unsupported operations
- Degraded surfaces
- Recovery suggestions
- Overall status: compatible, degraded, incompatible, or unknown

For every OpenClaw integration change, the final report must include:
- Which OpenClaw capabilities were touched
- Whether each capability is native Gateway/API, CLI fallback, sidecar-derived, unsupported, or unknown
- Whether contract tests were added or updated
- Whether compatibility was checked against the recommended OpenClaw version
- Any known compatibility risk with latest stable or beta OpenClaw


## Security Rules

Security must be treated as a release-blocking concern when touching API routes, auth, accounts, integrations, model credentials, browser profiles, local operator access, release scripts, or publish flows.

Rules:
- Do not treat CSRF protection, Origin checks, Referer checks, Host checks, loopback checks, or local network assumptions as authentication.
- Do not expose read or write API routes without intentional access control.
- Do not weaken existing local-operator, auth, or safety checks to make UI flows easier.
- Do not add unauthenticated access to sensitive runtime state, credentials, account profiles, browser sessions, logs, files, environment values, or OpenClaw control actions.
- Never log secrets, tokens, cookies, API keys, auth profiles, npm tokens, OpenAI keys, OpenRouter keys, browser session data, or private environment values.
- Never print secret values in terminal output, debug logs, test output, release notes, GitHub Actions logs, or error messages.
- Never commit `.env`, `.env.local`, `.env.production`, local credential files, browser profile data, tokens, cookies, or generated secret files.
- If a script needs an environment variable, validate that it exists without printing its value.
- If a secret is missing, fail with a safe, clear message.
- When editing release or publish flows, confirm that npm/GitHub tokens are used only through environment variables or approved secret stores.
- Do not store user credentials inside repo-tracked files.
- Do not create fake auth, bypass auth, or add temporary insecure shortcuts unless the user explicitly asks for a local-only prototype, and even then mark it clearly as unsafe and do not ship it.
- Do not trust client-controlled headers as proof of identity.
- Do not rely on browser-only protections for non-browser clients.
- Sensitive API responses should return only the minimum fields needed by the UI.
- Error messages should be useful but must not leak secrets, filesystem paths containing private usernames when avoidable, tokens, cookies, or internal credential material.
- When practical, add or update tests for unauthorized access, degraded auth state, missing credentials, unsafe fallback behavior, and secret redaction.

When touching security-sensitive code, the final report must include:
- Which sensitive surfaces were touched
- What access-control assumptions were used
- Whether secrets are redacted
- Whether `.env*` files remain untracked
- Whether unauthorized/degraded cases were tested
- Any remaining security risks or follow-up tasks


## Final Report Format

At the end of every task, Codex must provide a concise but complete final report. Do not hide failed steps. Do not claim success unless commands were actually run and completed successfully.

Use this format:

### Summary
- Briefly explain what was changed and why.
- Mention whether the task is fully complete, partially complete, or blocked.

### Files Changed
- List each changed file.
- For each file, explain the purpose of the change in one short sentence.

### OpenClaw Compatibility
- List every OpenClaw capability touched.
- For each capability, mark it as:
  - Native Gateway/API
  - CLI fallback
  - Sidecar-derived
  - Unsupported
  - Unknown
- Include installed/recommended OpenClaw version if checked.
- Include native coverage, fallback count, degraded surfaces, and unsupported operations when available.
- Mention whether contract tests were added or updated.
- Mention any compatibility risk with latest stable or beta OpenClaw.

### Security
- State whether the task touched security-sensitive surfaces.
- If yes, list which ones.
- Confirm that no secrets were logged or committed.
- Confirm that `.env*` files remain untracked.
- Mention any access-control, auth, token, credential, browser profile, or API route risks.
- Mention whether unauthorized/degraded cases were tested.

### Validation
- List every command run, for example:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm openclaw:compat`
- Mark each command as passed, failed, skipped, or not available.
- If skipped, explain why.
- If failed, include the exact failure summary and what remains to fix.

### Release / Publish
Use this section only when the task touches release or publishing.
- Version prepared or published
- Commit hash
- Git tag
- GitHub release link
- npm package/version link
- Release assets/checksums status
- Whether release consistency checks passed
- Any manual follow-up needed

### Known Issues / Follow-ups
- List remaining issues honestly.
- Separate blockers from nice-to-have follow-ups.
- Do not invent completed work.
- Do not say something is production-ready unless validation proves it.