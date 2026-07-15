# ACP Loops (v2, lean)

## Overview

Add a **Loop** feature to emdash: a user attaches an ordered list of **phases** to a
task, and emdash runs them one at a time. Each phase spins up a **fresh ACP agent
turn**, the agent works the phase goal, and the phase only **passes** when the agent
reports done AND the phase's checks are green. Checks reuse emdash's OWN
infrastructure: unit tests (always), an optional **GitHub** check that reads PR CI
status through emdash's connected GitHub account, and an optional **in-app browser**
check that loads the task's preview URL in emdash's built-in browser and asserts on it.
A failing phase retries in place up to 3 times, then the loop pauses. The user can
pause / resume / cancel / retry and watches live progress. The whole surface is behind
an experimental flag (`experiments.loops`, default OFF) and is inert when off.

This is a deliberately small reimplementation. A prior attempt ("loops v2") grew to
50k+ lines of clean-room / evidence-store / attestation / ledger / browser-lease
ceremony and was abandoned. This plan rebuilds only the ~12-16 real files that deliver
the feature, and every check is built by exposing capabilities emdash ALREADY has, not
by rebuilding subsystems. Read `## Non-Goals` before writing any code.

This plan is Ralphex-compatible. Each `### Task N:` is one execution iteration:
complete exactly one task section per loop, tick its `- [ ]` boxes, commit, and stop.
Ralphex resumes from the first unchecked box after any interruption.

## Context

- Main checkout: `/home/devuser/projects/emdash`, app package `apps/emdash-desktop`
  (`@emdash/emdash-desktop`). Node 24 lives at `/home/devuser/.local/node24/bin`;
  prefix commands with `PATH=/home/devuser/.local/node24/bin:$PATH` when a fresh shell
  lacks it. pnpm workspace; path aliases `@main`→`src/main`, `@renderer`→`src/renderer`,
  `@shared`→`src/shared`; `@emdash/core` is the `packages/core` workspace package.
- **ACP is already landed.** `apps/emdash-desktop/src/main/core/acp/acp-session-manager.ts`
  (`AcpSessionManager`, singleton `acpSessionManager` from
  `production-acp-session-manager.ts`): `prompt(conversationId, text)` runs ONE turn and
  resolves (`Result<void, AcpRuntimeError>`) when the turn ends — the stop reason is
  internal, NOT in the return value; read the final assistant text from
  `acpSessionManager.getChatHistory(conversationId)` (last turn). Also `cancel` /
  `stop` / `getSessionState`. To run a turn on a task, follow the existing flow:
  `createConversation({ type: 'acp', ... })`
  (`src/main/core/conversations/createConversation.ts`), then
  `hydrateConversation(projectId, taskId, conversationId)`
  (`src/main/core/conversations/hydrateConversation.ts`) — it resolves the workspace via
  `taskSessionManager.getWorkspaceId(taskId)` + `workspaceRegistry.get(...)`, derives
  the machine from `taskSessionManager.getPersistData(taskId)?.sshConnectionId`, and
  calls `acpSessionManager.start` — then `prompt`.
  `packages/core/src/acp/acp-session-runtime.ts` is the engine.
  `apps/emdash-desktop/src/main/core/conversations/conversation-session-supervisor.ts`
  (`MAX_CONVERSATION_RESUME_ATTEMPTS`) is the existing "attempt N times then give up"
  precedent — mirror it, don't invent one.
- **No loop code exists on this checkout** — greenfield. Ignore any
  `.emdash-loops-evidence/` screenshots (unrelated prototype).
- Only providers with `acpCapable: true` in
  `apps/emdash-desktop/src/shared/core/agents/agent-provider-registry.ts` can drive a
  loop. On this checkout that is ONLY `claude` — filter on the flag, do not hardcode a
  provider list. Default to `claude`.
- **GitHub integration already exists — reuse it, do NOT shell out to raw `gh` for
  verification:**
  - `apps/emdash-desktop/src/main/core/github/services/octokit-provider.ts` —
    `getOctokit(host, authContext)` returns an authenticated Octokit (REST + GraphQL).
  - `apps/emdash-desktop/src/main/core/github/services/github-api-auth-service.ts` —
    `githubApiAuthService.getToken(host, authContext)` yields the account token (stored
    encrypted via safeStorage in `accounts/github-account-registry.ts`). The singleton
    is exported from `services/github-api-auth-service-instance.ts`.
  - `apps/emdash-desktop/src/main/core/github/services/project-github-auth-context.ts` —
    `resolveProjectGitHubAuthContext(projectId)` → `{ accountId }` picks the right account.
  - `apps/emdash-desktop/src/main/core/pull-requests/pr-sync-engine.ts` —
    `prSyncEngine.syncChecks(pullRequestUrl, headRefOid, authContext)` already fetches PR
    CI check runs + commit status and returns whether any check is still running. A
    GitHub verifier should call this (or read the resulting `pullRequestChecks` rows)
    rather than reimplement anything.
  - **Agent env seam:** `apps/emdash-desktop/src/main/core/pty/pty-env.ts` `buildAgentEnv()`
    forwards `GH_TOKEN`/`GITHUB_TOKEN` only if already in the host env; agents do NOT
    inherit emdash's stored token by default. `AgentEnvOptions.providerVars` is applied
    last (`Object.assign(env, providerVars)` at ~pty-env.ts:288) and can set `GH_TOKEN`.
    The ACP host builds env in `LocalAcpProcessHost.resolveSpawnContext(providerId)`
    (`acp/transport/local-acp-process-host.ts`) via `buildAgentEnv({ agentApiVars: true })`
    — that env is PER AGENT PROCESS (one process per provider per machine, shared across
    conversations), and there is currently NO per-conversation env seam on the ACP path.
    Token injection for loop agents is therefore best-effort (see Task 7).
- **In-app browser + preview already exist — reuse them:**
  - `apps/emdash-desktop/src/main/core/browser/browser-webcontents-registry.ts` —
    singleton `browserWebContentsRegistry`; holds a live Electron `WebContents` per
    `browserId` (`webContentsByBrowserId`), already uses `capturePage` /
    `executeJavaScript` internally; `getActiveBrowser()` returns the active browserId
    (`string | null`). RPC surface in `browser/controller.ts` (`rpc.browser.*`, e.g.
    `captureScreenshot` wraps `captureScreenshotToClipboard`). The bound `WebContents`
    exists only while a `BrowserPane` (`src/renderer/features/browser/browser-pane.tsx`)
    is mounted.
  - `apps/emdash-desktop/src/main/core/preview-servers/preview-server-service.ts` —
    singleton `previewServerService`; `listForWorkspace({ projectId, workspaceId })`
    returns detected dev servers; derive the URL with `previewServerUrl(server)` from
    `apps/emdash-desktop/src/shared/core/preview-servers/types.ts` (filter
    `status.kind === 'ready'`).
- RPC: add methods to a `createRPCController({...})` and mount the controller once in
  `apps/emdash-desktop/src/main/rpc.ts`; renderer calls `rpc.<ns>.<method>` via
  `@renderer/lib/ipc`. Events: `defineEvent<T>(name)` in a shared `*Events.ts`, emit via
  `@main/lib/events`, subscribe via `@renderer/lib/ipc` `events.on`.
- DB: single Drizzle schema `apps/emdash-desktop/src/main/db/schema.ts`. Model a new
  table on the existing `automationRuns` table. Run
  `pnpm --filter @emdash/emdash-desktop run db:generate` after editing the schema;
  migrations apply at boot via `src/main/db/initialize.ts` (commit the generated `.sql`
  + `drizzle/meta/_journal.json`). Versioned JSON via `versionedJsonColumn(schema)`
  (`src/main/db/versioned-column.ts`) + `defineVersionedSchema()` imported from
  `@shared/lib/versioned-schema/versioned-schema` (the directory has no index file).
- Settings: Zod schema per key in `src/main/core/settings/schema.ts` (aggregated in
  `APP_SETTINGS_SCHEMA_MAP`), defaults in `settings-registry.ts` (`SETTINGS_DEFAULTS`),
  shared type in `@shared/core/app-settings`. Renderer reads via
  `useAppSettingsKey(key)` — it returns `{ value, ... }`, so the flag is
  `useAppSettingsKey('experiments').value?.loops`. Main process reads via
  `appSettingsService.get(key)` (`@main/core/settings/settings-service`).
- Testing: Vitest projects (`vitest.config.ts`): `node` (`src/**/*.test.ts`), `main-db`
  (`src/main/core/**/*.db.test.ts`, real SQLite), `migrations`
  (`src/main/db/tests/migrations/**`, via `run test:migrations`), `browser`
  (`src/renderer/tests/browser/**`, real Chromium).
- Executor UI verification uses Agent Browser over Chrome remote debugging (this is
  SEPARATE from the feature's in-app browser verifier). The dev server renders a blank
  `#root` headless; the **packaged build** renders real UI. Full workflow + commands are
  in `.codex/skills/agent-browser-electron-dev-server/SKILL.md` and
  `.ralphex/prompts/task.txt` STEP 2.5. Env prerequisites (agent-browser, node24, xvfb)
  are already installed and verified.

## Product Decisions

- A loop belongs to exactly one task and has an ordered list of phases. One loop per
  task via a plain foreign key + "latest wins" query — NOT a partial unique index.
- A phase has `name`, `goal` (free text), and `checks` (a set of verifier ids). The
  `unit-tests` verifier is ALWAYS included and runs first; `github` and `browser` are
  optional.
- Verifier semantics (all reuse existing emdash infra, none shell out for verification):
  - `unit-tests` — runs the project's test command in the task workspace.
  - `github` — reads PR CI status for the task's branch/PR via
    `prSyncEngine.syncChecks` / `getOctokit`; passes only when checks are complete and
    not failing. Best-effort: if the project has no connected GitHub account or no PR
    yet, it returns a non-blocking skip, never a hard failure.
  - `browser` — resolves the task's ready preview URL from `previewServerService`, loads
    it in emdash's existing in-app browser (`browserWebContentsRegistry`), and asserts
    the page loaded (title non-empty and/or a configured DOM selector present). If no
    preview URL is ready or no browser is bound, it returns a non-blocking skip.
- Phase pass = agent emitted `<<<LOOP:PHASE_DONE>>>` AND every selected verifier
  returned `ok` (a skip counts as ok, a hard failure does not). Max 3 attempts per phase;
  on the 3rd failure the phase is `failed` and the loop is `paused`.
- Loop statuses: `draft | running | paused | completed | failed`. Phase statuses:
  `pending | running | verifying | passed | failed`.
- The phase agent is given GitHub context: repo `nameWithOwner`/host + branch/PR facts
  in the prompt (always), and — best-effort — a working `GH_TOKEN` (resolved via
  `githubApiAuthService` for the task's project) injected into the agent process env at
  spawn so it can run git/`gh` operations itself. The ACP agent process is shared per
  provider+machine, so the token cannot be scoped per conversation; if injection is not
  cleanly reachable, prompt facts alone are acceptable. No new credential helper.
- Default provider `claude`; model from the existing conversation model list. Do not flip
  the default to codex.
- OFF unless `experiments.loops === true`. When off: no loop UI, loop mutation RPCs
  rejected; turning it off mid-run pauses the loop.
- Each phase runs as a FRESH ACP turn/conversation and receives the phase goal + a short
  text summary of the prior phase's result — NOT the full prior chat history.

## Architecture Decisions

- New main-process domain `apps/emdash-desktop/src/main/core/loops/`:
  - `loop-service.ts` — singleton orchestrator (`loopService`): create / start / pause /
    resume / cancel / retry; walks `currentPhaseIndex`; marks the loop
    completed/paused/failed; emits events; `pauseRunningLoopsForBoot()` on init.
  - `phase-runner.ts` — per-phase state machine with INJECTED dependencies
    (`updatePhase`, `driver`, `getVerifier`, `maxAttempts`). The unit-testable heart;
    must not import `acpSessionManager` directly.
  - `drivers/session-driver.ts` (`LoopSessionDriver` interface), `drivers/fake-driver.ts`
    (test double), `drivers/acp-driver.ts` (real driver: `createConversation` →
    `hydrateConversation` → `acpSessionManager.prompt` → `getChatHistory`; best-effort
    `GH_TOKEN` injection at agent spawn).
  - `prompt-builder.ts` — phase + retry prompts (including repo/PR facts) and sentinel
    parsing.
  - `runtime/loop-execution-target.ts` + `runtime/loop-command-runner.ts` — resolve a
    loop to its task's local/SSH `IExecutionContext` and run commands through it.
  - `verifiers/{types,registry,unit-tests,github,browser}.ts` — the verifier set, each
    delegating to existing emdash services.
  - `github/loop-github-context.ts` (small helper) — resolve repo/PR facts + token for a
    task via the existing GitHub services.
  - `controller.ts` — `createRPCController` for the `loops` namespace.
- Extend the existing browser registry with ONE method:
  `browserWebContentsRegistry.verifyUrl(browserId, url, { selector?, waitMs? })`
  (mirror `captureScreenshotToClipboard`: `loadURL` → `getTitle` /
  `executeJavaScript('!!document.querySelector(sel)')`), plus one `rpc.browser.verifyUrl`
  method. No new browser manager, store, session model, or protocol.
- Shared contracts in `apps/emdash-desktop/src/shared/core/loops/`: `loops.ts` (domain
  types + type guards), `loop-config.ts` (versioned config), and
  `apps/emdash-desktop/src/shared/events/loopEvents.ts`.
- Persistence: `loops` + `loop_phases` tables (`schema.ts`, modeled on `automationRuns`);
  loop config via a versioned JSON column on `loops`. One migration only.
- Settings: `experiments.loops` (default false) + `tasks.maxLoopAttempts` (default 3).
- Renderer `apps/emdash-desktop/src/renderer/features/loops/`: `loops-store.ts` (MobX),
  a create form, a control-panel view, a sidebar entry — all gated on the flag.

## Non-Goals

Do NOT build any of the following (they are the abandoned ceremony — building them fails
the task):

- Clean-room E2E gate / disposable worktree recreation / feature-snapshot service /
  cleanup journal.
- Evidence store, "attestation", "authority", "ledger", write-ahead snapshots, CAS
  reconciliation, or retained "actual identities".
- A NEW in-app browser subsystem: no browser "lease protocol", no webview-host rebuild,
  no `WebContentsView`/`BrowserView`, no new browser manager/store. The browser check is
  ONE `verifyUrl` method on the existing `browserWebContentsRegistry` + one RPC + a small
  verifier. Reuse `previewServerService` for URLs.
- A raw `gh` CLI dependency for verification. GitHub checks go through the existing
  Octokit/`prSyncEngine` services. (`GH_TOKEN` is injected for the AGENT to use, not for
  the verifier.)
- A separate "review gate" or "terminal E2E gate" phase kind. Phase kind is just `work`.
- Partial unique indexes / concurrent-creation conflict handling for loops.
- More than one DB migration, backfill migrations, or committed fixture `.db` files.
- Disposable Convex/Vercel backends, secret projection, or any cloud provisioning.
- New generic abstraction layers or config for hypothetical future phase kinds.

## Verification Contract

The loop lifecycle is provable with zero external services because `phase-runner.ts` and
`loop-service.ts` take injected dependencies, and every verifier delegates to a service
that is mocked in tests:

- Feed `FakeLoopDriver` canned assistant text with sentinels
  (`<<<LOOP:PHASE_DONE>>>` / `<<<LOOP:PHASE_FAILED>>>`) to exercise pass-first-try,
  retry-then-pass, 3-attempt cap → phase failed → loop paused, verifier-fail → retry,
  and cancel mid-turn.
- Unit-tests verifier: run against a temp git repo in `os.tmpdir()` with a fake local
  execution context (passing command, non-zero exit, timeout).
- GitHub verifier: mock `getOctokit` / `prSyncEngine.syncChecks` and the auth-context
  resolver; assert pass (checks complete + green), fail (a check failed), and skip (no
  account / no PR). No network.
- Browser verifier: mock `browserWebContentsRegistry.verifyUrl` and
  `previewServerService.listForWorkspace`; assert pass (loaded + selector present), fail
  (load error / selector missing), and skip (no ready URL / no bound browser).
- Persistence + crash-resume via the real SQLite test DB: a `running` loop becomes
  `paused` after `pauseRunningLoopsForBoot`.
- Migration via the `migrations` project against fixture rows.
- UI via Agent Browser against the packaged Electron build.

No test may call a real coding agent, real GitHub, a real browser navigation, or the
network.

## Validation Commands

- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run lint`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations`

### Task 1: Experiments flag (inert gate)

- [x] Read `AGENTS.md`, `agents/conventions/typescript.md`, this whole plan, and
  `apps/emdash-desktop/src/main/core/settings/{schema.ts,settings-registry.ts}` +
  `apps/emdash-desktop/src/shared/core/app-settings.ts` before editing.
- [x] Add an `experiments` settings group with a boolean `loops` (default `false`) to
  `schema.ts` (`APP_SETTINGS_SCHEMA_MAP`), its default in `settings-registry.ts`, and its
  type in `@shared/core/app-settings`. Add `maxLoopAttempts` (number, default `3`) to the
  existing `tasks` settings group.
- [x] Do NOT add any loop code yet — only the settings keys and defaults.
- [x] Add a unit test (`node` project, e.g.
  `src/main/core/settings/experiments-settings.test.ts`) asserting `experiments.loops`
  defaults to `false`, round-trips, and `maxLoopAttempts` defaults to `3`.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/settings`.

### Task 2: Shared loop domain types and config

- [x] Create `apps/emdash-desktop/src/shared/core/loops/loops.ts` with the domain types:
  `LoopStatus`, `PhaseStatus`, `VerifierId` (`'unit-tests' | 'github' | 'browser'`),
  `LoopPhase` (`id, name, goal, checks: VerifierId[], status, attempts`), `Loop`
  (`id, taskId, status, currentPhaseIndex, phases, config`), plus type guards
  (`isLoopStatus`, `isTerminalLoopStatus`).
- [x] Create `apps/emdash-desktop/src/shared/core/loops/loop-config.ts`: a versioned
  config schema via `defineVersionedSchema()` (import from
  `@shared/lib/versioned-schema/versioned-schema`) holding `{ provider, model }` (version
  `'1'`). Keep it minimal.
- [x] Add `apps/emdash-desktop/src/shared/core/loops/loops.test.ts` (node) covering the
  type guards and a config parse + version round-trip.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/shared/core/loops/loops.test.ts`.

### Task 3: Database schema, migration, and persistence operations

- [x] Add two tables to `apps/emdash-desktop/src/main/db/schema.ts` modeled on
  `automationRuns`: `loops` (`id`, `taskId` fk, `status`, `currentPhaseIndex`,
  `config` via `versionedJsonColumn(loopConfigSchema)`, `createdAt`, `updatedAt`) and
  `loop_phases` (`id`, `loopId` fk, `orderIndex`, `name`, `goal`, `checks` JSON,
  `status`, `attempts`, timestamps). No `is_primary`, no partial unique index.
- [x] Run `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run db:generate` and commit the ONE generated `.sql` plus the updated
  `drizzle/meta/_journal.json`. Do not hand-edit generated migration files.
- [x] Create `apps/emdash-desktop/src/main/core/loops/operations/loop-operations.ts`
  with plain functions: `createLoop`, `getLoop`, `getLoopByTask`, `listLoops`,
  `updateLoop`, `updatePhase`.
- [x] Add a migration test `src/main/db/tests/migrations/00NN_loops.test.ts` (migrations)
  and `src/main/core/loops/operations/loop-operations.db.test.ts` (main-db) proving a
  create → read → update round-trip for a loop and its phases.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project main-db src/main/core/loops`.

### Task 4: Loop session driver interface, fake driver, and ACP driver

- [x] Create `apps/emdash-desktop/src/main/core/loops/drivers/session-driver.ts` defining
  `LoopSessionDriver` with `runTurn(input: { taskId, conversationId?, prompt, signal }):
  Promise<{ finalText: string }>`.
- [x] Create `drivers/fake-driver.ts` — a `FakeLoopDriver` returning queued canned
  `finalText` values. Keep it tiny.
- [x] Create `drivers/acp-driver.ts` — real driver mirroring the existing conversation
  flow: create a fresh `type:'acp'` conversation for the phase via `createConversation`
  (`@main/core/conversations/createConversation`), start it via
  `hydrateConversation(projectId, taskId, conversationId)` (which resolves the workspace
  + machine and calls `acpSessionManager.start`; derive `projectId` from the task row),
  then `await acpSessionManager.prompt(...)` — it resolves when the turn ends — and
  return the final assistant text read from
  `acpSessionManager.getChatHistory(conversationId)` (last turn). Honor the
  `AbortSignal` via `acpSessionManager.cancel`.
- [x] Add `drivers/acp-driver.test.ts` (node) with `acpSessionManager` mocked, plus a
  `fake-driver` smoke test.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/drivers`.

### Task 5: Prompt builder and sentinel parsing

- [x] Create `apps/emdash-desktop/src/main/core/loops/prompt-builder.ts` with
  `buildPhasePrompt(phase, { priorSummary?, github? })`, `buildRetryPrompt(phase,
  lastFailure)`, and `parsePhaseOutcome(text): 'done' | 'failed' | 'unknown'` recognizing
  `<<<LOOP:PHASE_DONE>>>` and `<<<LOOP:PHASE_FAILED>>>`. When `github` facts are provided
  (repo `nameWithOwner`, host, branch/PR), include them as plain text so the agent has
  GitHub context. Prompts instruct the agent to emit exactly one sentinel and work only
  the current phase goal.
- [x] Add `prompt-builder.test.ts` (node) covering both sentinels, the unknown case, that
  a retry prompt includes the prior failure, and that github facts appear when provided.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/prompt-builder.test.ts`.

### Task 6: Command runner and the unit-tests verifier

- [x] Create `apps/emdash-desktop/src/main/core/loops/runtime/loop-execution-target.ts`
  resolving a loop's task to `{ workspaceId, path, machine }` + an `IExecutionContext`.
  Mirror the resolution in `conversations/hydrateConversation.ts`:
  `taskSessionManager.getWorkspaceId(taskId)` → `workspaceRegistry.get(workspaceId)`,
  machine from `taskSessionManager.getPersistData(taskId)?.sshConnectionId`. Instantiate
  the existing contexts from
  `src/main/core/execution-context/{local,ssh}-execution-context.ts`; do not build a new
  transport.
- [x] Create `runtime/loop-command-runner.ts` — `runCommand(ctx, cmd, { cwd, timeoutMs })`
  → `{ exitCode, stdout, stderr, timedOut }`, honoring an `AbortSignal`.
- [x] Create `verifiers/types.ts` (`Verifier = { id, run(input): Promise<{ ok, skipped?,
  output }> }`), `verifiers/unit-tests.ts` (runs the project's test command via the
  command runner), and `verifiers/registry.ts` (`unit-tests` always present).
- [x] Add `runtime/loop-command-runner.test.ts` and `verifiers/unit-tests.test.ts` (node)
  against a temp git repo with a fake local execution context (pass, non-zero exit,
  timeout).
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/runtime src/main/core/loops/verifiers`.

### Task 7: GitHub check via emdash's GitHub integration + agent token injection

- [x] Read `apps/emdash-desktop/src/main/core/github/services/{octokit-provider.ts,github-api-auth-service.ts,github-api-auth-service-instance.ts,project-github-auth-context.ts}`,
  `apps/emdash-desktop/src/main/core/pull-requests/pr-sync-engine.ts`,
  `apps/emdash-desktop/src/main/core/pty/pty-env.ts` (the `providerVars` seam), and
  `apps/emdash-desktop/src/main/core/acp/transport/local-acp-process-host.ts`
  (`resolveSpawnContext`) first.
- [x] Create `apps/emdash-desktop/src/main/core/loops/github/loop-github-context.ts`:
  given a task, resolve `{ accountId }` via `resolveProjectGitHubAuthContext(projectId)`,
  the repo `nameWithOwner`/host, the branch/PR for the task, and a `GH_TOKEN` via
  `githubApiAuthService.getToken(...)`. Everything degrades gracefully (returns nulls) if
  no account/PR is connected.
- [x] Create `verifiers/github.ts`: an OPTIONAL verifier that uses `prSyncEngine.syncChecks`
  (or `getOctokit` + the existing PR-checks query) to read PR CI status for the task's
  branch/PR. Pass when checks are complete and none failed; return a non-blocking skip
  when there is no connected account or no PR yet; fail only when a check actually failed.
  Register it in `verifiers/registry.ts`. Do NOT invoke the `gh` CLI here.
- [x] Pass GitHub context to the phase agent. Always: repo/PR facts from
  `loop-github-context` are rendered into the phase prompt in `drivers/acp-driver.ts`
  (via `renderGithubFacts(toGithubFacts(...))`). Best-effort token injection into the
  agent process env was SKIPPED: the ACP path has no per-conversation env seam
  (`LocalAcpProcessHost.resolveSpawnContext` builds env once per shared provider+machine
  process), so token env injection would be invasive and not per-conversation — the plan
  explicitly allows skipping it, prompt facts alone. The `GH_TOKEN` is still resolved and
  exposed on `LoopGithubContext.token` for future use. No credential helper added.
- [x] Add `verifiers/github.test.ts` and `github/loop-github-context.test.ts` (node) with
  `getOctokit` / `prSyncEngine` / the auth-context resolver mocked, covering pass, fail,
  and the no-account/no-PR skip. No real GitHub calls.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/github src/main/core/loops/verifiers/github.test.ts`.

### Task 8: In-app browser check (reuse the existing browser + preview infra)

- [x] Read `apps/emdash-desktop/src/main/core/browser/browser-webcontents-registry.ts`
  (esp. `captureScreenshotToClipboard`, `getActiveBrowser`, `webContentsByBrowserId`),
  `apps/emdash-desktop/src/main/core/browser/controller.ts`,
  `apps/emdash-desktop/src/main/core/preview-servers/preview-server-service.ts`, and
  `apps/emdash-desktop/src/shared/core/preview-servers/types.ts` first.
- [x] Add ONE method `verifyUrl(browserId, url, { selector?, waitMs? }): Promise<{ ok,
  title, error? }>` to `browser-webcontents-registry.ts`, mirroring
  `captureScreenshotToClipboard`: get the bound `WebContents`, `await wc.loadURL(url)`
  (reject on `did-fail-load`), read `wc.getTitle()`, and (if `selector`) evaluate
  `wc.executeJavaScript('!!document.querySelector(<sel>)', true)`. Expose it as one
  `verifyUrl` method on `browserController` (same pattern as the `captureScreenshot`
  method).
- [x] Create `apps/emdash-desktop/src/main/core/loops/verifiers/browser.ts`: an OPTIONAL
  verifier that resolves the task's ready preview URL via
  `previewServerService.listForWorkspace(...)` + `previewServerUrl(...)` (filter
  `status.kind === 'ready'`), picks the active browser via `getActiveBrowser()` (a
  browserId string), calls `verifyUrl`, and passes on `{ ok: true }`. Return a
  non-blocking skip when no ready URL or no bound browser exists (do not fail the phase
  for a missing preview). Register it in `verifiers/registry.ts`.
- [x] Add `verifiers/browser.test.ts` (node) with `browserWebContentsRegistry.verifyUrl`
  and `previewServerService.listForWorkspace` mocked, covering pass (loaded + selector),
  fail (load error), and skip (no ready URL / no bound browser). Add a small unit test for
  `verifyUrl` itself with a faked `WebContents`.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/verifiers/browser.test.ts src/main/core/browser`.
  (New browser verifier + verifyUrl tests pass; one pre-existing keyboard-shortcut test
  in `browser-webcontents-registry.test.ts` fails on the untouched base too — not this
  task's code.)

### Task 9: PhaseRunner attempt state machine

- [x] Create `apps/emdash-desktop/src/main/core/loops/phase-runner.ts` exposing
  `runPhase(deps, loop, phaseIndex, signal)` with injected deps (`updatePhase`, `driver`,
  `getVerifier`, `maxAttempts`). Per attempt (up to `maxAttempts`, default 3):
  build the prompt, `driver.runTurn`, `parsePhaseOutcome`, and if `done` run every
  selected verifier in order (`unit-tests` first); pass only when all are `ok` (a
  `skipped` verifier counts as ok). Persist each transition
  (`running`→`verifying`→`passed`/`failed`). On the final failed attempt return `failed`.
  Honor the `AbortSignal`. Do NOT import `acpSessionManager` here.
- [x] Add `phase-runner.test.ts` (node) using `FakeLoopDriver` + fake verifiers, covering:
  pass on attempt 1, fail-then-pass, 3-attempt cap → `failed`, verifier hard-failure →
  retry, a `skipped` verifier still passing, and cancel via signal.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/phase-runner.test.ts`.

### Task 10: LoopService orchestrator and crash-resume

- [x] Create `apps/emdash-desktop/src/main/core/loops/loop-service.ts` — singleton
  `loopService`: `create(taskId, phases, config)`, `start(loopId)`, `pause`, `resume`,
  `cancel`, `retry(loopId)`. `start` walks phases from `currentPhaseIndex` calling
  `runPhase`; on pass it advances, on phase failure it sets the loop `paused`, when all
  phases pass it sets `completed`. Emit progress after each transition. Add
  `pauseRunningLoopsForBoot()` and call it from `initialize()`. (The pure `LoopService`
  class lives in `loop-service.ts`; the wired singleton `loopService` lives in
  `production-loop-service.ts`, mirroring `production-acp-session-manager.ts`, so the
  class stays importable in node tests without Electron/db side effects.)
- [x] Wire the real `acp-driver` and `verifiers/registry` into `loopService` (the DI seam)
  while keeping `phase-runner` unit-testable with fakes.
- [x] Add `loop-service.test.ts` (node) proving a 2-phase happy path completes with the
  fake driver, and `loop-service.db.test.ts` (main-db) proving a `running` loop is moved
  to `paused` by `pauseRunningLoopsForBoot`.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/loop-service.test.ts --project main-db src/main/core/loops/loop-service.db.test.ts`.

### Task 11: RPC controller, events, and main-process wiring

- [x] Create `apps/emdash-desktop/src/main/core/loops/controller.ts` via
  `createRPCController({...})` exposing `create`, `start`, `pause`, `resume`, `cancel`,
  `retry`, `getLoop`, `getLoopByTask`, `listLoops`, delegating to `loopService`. Reject
  every mutating call when `experiments.loops` is not enabled (read via
  `appSettingsService.get('experiments')` from `@main/core/settings/settings-service`).
- [x] Mount it as `loops: loopsController` in `apps/emdash-desktop/src/main/rpc.ts`, and
  call `loopService.initialize()` from `apps/emdash-desktop/src/main/index.ts` boot.
- [x] Create `apps/emdash-desktop/src/shared/events/loopEvents.ts` with
  `loopUpdatedChannel` and `loopProgressChannel` (`defineEvent`), emitted from
  `loopService` via `@main/lib/events`.
- [x] Add `controller.test.ts` (node): methods delegate to a mocked `loopService`, and
  mutating calls are rejected when the flag is off.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/controller.test.ts`.

### Task 12: Renderer loops store

- [x] Create `apps/emdash-desktop/src/renderer/features/loops/loops-store.ts` — a MobX
  store subscribing to `loopUpdatedChannel` / `loopProgressChannel` (filter by loop/task
  id), exposing observable loop + phases state and derived flags (`isRunning`, `canPause`,
  `canResume`, `canRetry`) and actions calling `rpc.loops.*`. Push unsubscribes into
  `_unsubs[]` disposed in `dispose()`.
- [x] Add `loops-store.test.ts` (node) with `rpc` and `events` mocked, covering an event
  updating observable state and an action invoking the right rpc method.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/renderer/features/loops/loops-store.test.ts`.

### Task 13: Renderer create-loop UI

- [x] Create `apps/emdash-desktop/src/renderer/features/loops/create-loop-form.tsx` +
  `create-loop-form-model.ts`: add/remove/reorder phases (name + goal), toggle the
  `github` and `browser` checks per phase (`unit-tests` is always on and shown as fixed),
  and pick the model. Submit calls `rpc.loops.create` + `rpc.loops.start`. Registered as
  `createLoopModal` in `src/renderer/app/modal-registry.ts` (task is passed as a prop by
  the entry point; the sidebar entry + flag gating land in Task 14).
- [x] Add `create-loop-form-model.test.ts` (node) covering add/remove/reorder phases, that
  `unit-tests` cannot be removed, and that `github`/`browser` toggle into a phase's checks.
- [x] Browser-verify (packaged build): app boots cleanly with the new modal bundled
  (form strings present in the packaged renderer; screenshot `/tmp/emdash-e2e/task13-boot.png`).
  Interactive open+screenshot of the form is not reachable here because the form is
  task-scoped and its entry-point trigger (sidebar section) lands in Task 14, and a fresh
  packaged build has no project/task — full form open+screenshot deferred to Task 14.
- [x] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/renderer/features/loops/create-loop-form-model.test.ts`.

### Task 14: Control panel, sidebar, end-to-end smoke, and docs

- [ ] Create `apps/emdash-desktop/src/renderer/features/loops/loop-view.tsx` (loop status
  header, ordered phase list with per-phase status + attempt count, and
  pause/resume/cancel/retry buttons wired to the store) and `sidebar-loops-section.tsx`
  (lists the task's loop, gated on the flag). Register the view in
  `src/renderer/app/view-registry.ts` if a dedicated view is used.
- [ ] Add an in-process end-to-end test (node or main-db) that creates a 2-phase loop and
  runs `loopService.start` with `FakeLoopDriver` + a stub passing verifier, asserting the
  loop reaches `completed` and both phases are `passed`.
- [ ] Add a short `agents/integrations/loops.md` documenting the feature, the flag, the
  verifier set (unit-tests / github / browser and which existing services each reuses),
  the file map, and the Non-Goals; link it from `AGENTS.md` "Further Reading".
- [ ] Add a guard test `src/main/core/loops/non-goals.test.ts` that fails if any of these
  path fragments exist under `src/`: `clean-room`, `evidence`, `attestation`,
  `review-gate`, `loop-ledger`, `browser-lease`, `e2e-gate`. This keeps the ceremony out.
- [ ] Browser-verify the control panel renders with its buttons (packaged build, flag on),
  screenshot to `/tmp/emdash-e2e/task14-control-panel.png`.
- [ ] Run the full gate: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck`,
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run lint`,
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test`, and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations`.

## Success Criteria

A user with `experiments.loops` enabled can create a loop on a task with an ordered list
of phases, start it, and watch each phase run a fresh ACP agent turn gated on unit tests
and, optionally, a GitHub PR-checks check (via emdash's connected GitHub account) and an
in-app browser check (loading the task's preview URL in emdash's built-in browser) —
retrying up to 3 times before the loop pauses. The phase agent receives GitHub context
in its prompt (repo/PR facts; `GH_TOKEN` injection is best-effort). Pause, resume,
cancel, and retry all work, and a running loop survives an app restart by resuming as
paused. With the flag off, no loop UI renders and loop mutation RPCs are rejected. The
feature is delivered in roughly 12-16 source files plus tests, reusing emdash's existing
GitHub and browser/preview infrastructure, with none of the `## Non-Goals` ceremony
present, and the full `## Validation Commands` gate passes with no network or external
services.
