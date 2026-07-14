# ACP Loops (v2, lean)

## Overview

Add a **Loop** feature to emdash: a user attaches an ordered list of **phases** to a
task, and emdash runs them one at a time. Each phase spins up a **fresh ACP agent
turn**, the agent works the phase goal, and the phase only **passes** when the agent
reports done AND the phase's checks are green (unit tests always, plus optional
`gh`). A failing phase retries in place up to 3 times, then the loop pauses. The user
can pause / resume / cancel / retry, and watches live progress. The whole surface is
behind an experimental flag (`experiments.loops`, default OFF) and is completely inert
when the flag is off.

This is a deliberately small reimplementation. A prior attempt ("loops v2") grew to
50k+ lines of clean-room / evidence-store / attestation / ledger ceremony and was
abandoned. This plan rebuilds only the ~10-15 real files that deliver the feature. Read
`## Non-Goals` before writing any code and do not reintroduce that ceremony.

This plan is Ralphex-compatible. Each `### Task N:` is one execution iteration:
complete exactly one task section per loop, tick its `- [ ]` boxes, commit, and stop.
Ralphex resumes from the first unchecked box after any interruption.

## Context

- Main checkout: `/home/devuser/projects/emdash`, app package `apps/emdash-desktop`
  (`@emdash/emdash-desktop`). Node 24 lives at `/home/devuser/.local/node24/bin`;
  prefix commands with `PATH=/home/devuser/.local/node24/bin:$PATH` when a fresh shell
  lacks it. pnpm workspace; path aliases `@main`→`src/main`, `@renderer`→`src/renderer`,
  `@shared`→`src/shared`, `@emdash/core`→`packages/core`.
- **ACP is already landed** on `main` (PR #2695). The reusable primitives:
  - `apps/emdash-desktop/src/main/core/acp/acp-session-manager.ts` — `AcpSessionManager`
    (singleton `acpSessionManager` from `production-acp-session-manager.ts`).
    `prompt(conversationId, text)` runs ONE turn and resolves with a `stopReason`
    (`end_turn`). `cancel` / `stop` / `setModel` / `getChatHistory` / `getSessionState`.
  - `packages/core/src/acp/acp-session-runtime.ts` — the engine; `prompt()` is the
    atomic one-turn primitive. `onTurnCommitted` / `getSessionState().lastStopReason`
    signal turn completion.
  - `apps/emdash-desktop/src/main/core/conversations/conversation-session-supervisor.ts`
    (`ConversationSessionSupervisor`) is the existing "attempt N times then give up"
    precedent — mirror its shape, do not invent a new one.
- **There is NO loop code on `main`** — this is greenfield here. Any
  `.emdash-loops-evidence/` screenshots are from an unrelated prior prototype; ignore them.
- Only providers with `acpCapable: true` in
  `apps/emdash-desktop/src/shared/core/agents/agent-provider-registry.ts` (`claude`,
  `kimi`) can drive a loop. Default to `claude`.
- RPC: add methods to a `createRPCController({...})` and mount the controller once in
  `apps/emdash-desktop/src/main/rpc.ts`; the renderer calls `rpc.<ns>.<method>` via
  `@renderer/lib/ipc`. Events: `defineEvent<T>(name)` in a shared `*Events.ts`, emit via
  `@main/lib/events`, subscribe via `@renderer/lib/ipc` `events.on`.
- DB: single Drizzle schema `apps/emdash-desktop/src/main/db/schema.ts`. Model a new
  table on the existing `automationRuns` table (id / fk / status / timestamps). Run
  `pnpm --filter @emdash/emdash-desktop run db:generate` after editing the schema;
  migrations are applied at boot by `src/main/db/initialize.ts` (commit the generated
  `.sql` + `drizzle/meta/_journal.json`). Versioned JSON goes through
  `versionedJsonColumn(schema)` (`src/main/db/versioned-column.ts`) with a schema built
  by `defineVersionedSchema()` (`@shared/lib/versioned-schema`).
- Settings: Zod schema per key in `apps/emdash-desktop/src/main/core/settings/schema.ts`
  (aggregated in `APP_SETTINGS_SCHEMA_MAP`), defaults in `settings-registry.ts`, shared
  type in `@shared/core/app-settings`. Renderer reads via the `useAppSettingsKey(key)`
  hook.
- Testing: Vitest projects (`vitest.config.ts`): `node` (`src/**/*.test.ts`), `main-db`
  (`src/main/core/**/*.db.test.ts`, real SQLite), `migrations`
  (`src/main/db/tests/migrations/**/*.test.ts`, via `run test:migrations`), `browser`
  (`src/renderer/tests/browser/**`, real Chromium). Keep new DB tests as `*.db.test.ts`.
- Electron UI verification uses Agent Browser over Chrome remote debugging. The dev
  server renders a blank `#root` in headless CI; the **packaged build** renders real UI.
  The full workflow and the packaged-launch commands are in
  `.codex/skills/agent-browser-electron-dev-server/SKILL.md` and this repo's
  `.ralphex/prompts/task.txt` (STEP 2.5). Env prerequisites (agent-browser, node24,
  xvfb) are already installed and verified.

## Product Decisions

- A loop belongs to exactly one task and has an ordered list of phases. One primary
  loop per task is enforced by a plain foreign key + "latest wins" query — NOT a
  partial unique index or conflict-resolution machinery.
- A phase has: `name`, `goal` (free text), and `checks` (a set of verifier ids). The
  `unit-tests` verifier is ALWAYS included and runs first; `gh` is optional.
- Phase pass condition = agent emitted `<<<LOOP:PHASE_DONE>>>` AND every selected
  verifier returned success. Anything else is a failed attempt.
- Max 3 attempts per phase. On the 3rd failure the phase is `failed` and the loop is
  `paused` (not `failed` outright) so the user can inspect and retry.
- Loop statuses: `draft | running | paused | completed | failed`. Phase statuses:
  `pending | running | verifying | passed | failed`.
- Default agent provider is `claude`; model is chosen from the existing conversation
  model list. Do not flip the default to codex.
- The feature is OFF unless `experiments.loops === true`. When off: no loop UI is
  rendered and loop mutation RPCs are rejected. Turning the flag off while a loop runs
  pauses it.
- Each phase runs as a FRESH ACP turn/conversation; it receives the phase goal and a
  short text summary of the prior phase's result — NOT the full prior chat history.

## Architecture Decisions

- New main-process domain `apps/emdash-desktop/src/main/core/loops/`:
  - `loop-service.ts` — singleton orchestrator (`loopService`): create / start / pause /
    resume / cancel / retry; walks `currentPhaseIndex`; marks the loop
    completed/paused/failed; emits events; `pauseRunningLoopsForBoot()` on init for
    crash-resume. Mirror `ConversationSessionSupervisor` / other `*-service.ts` singletons.
  - `phase-runner.ts` — pure-ish per-phase state machine with INJECTED dependencies
    (`getLoop`, `updateLoop`, `driver`, `getVerifier`, `getDiff`, `signal`). This is the
    unit-testable heart; it must not import the real ACP manager directly.
  - `drivers/session-driver.ts` — `LoopSessionDriver` interface (`runTurn(input) =>
    { finalText }`); `drivers/fake-driver.ts` — test double returning canned text;
    `drivers/acp-driver.ts` — real driver wrapping `acpSessionManager`.
  - `prompt-builder.ts` — build phase + retry prompts, and parse the sentinels.
  - `runtime/loop-execution-target.ts` + `runtime/loop-command-runner.ts` — resolve a
    loop to its task's local/SSH `IExecutionContext` and run verifier commands through
    it (so loops work on remote projects). This is the one genuinely useful v2 idea; keep
    it small.
  - `verifiers/{types,registry,unit-tests,gh}.ts` — a tiny verifier set.
  - `controller.ts` — `createRPCController` for the `loops` namespace.
- Shared contracts in `apps/emdash-desktop/src/shared/core/loops/`: `loops.ts` (domain
  types + type guards), `loop-config.ts` (versioned config schema),
  `apps/emdash-desktop/src/shared/events/loopEvents.ts` (typed channels).
- Persistence: two tables in `schema.ts` — `loops` and `loop_phases` — modeled on
  `automationRuns`. Loop config (model/provider) stored via a versioned JSON column on
  `loops`. One migration only.
- Settings: `experiments` group with a single `loops: boolean` (default false) plus a
  `tasks.maxLoopAttempts` number (default 3).
- Renderer domain `apps/emdash-desktop/src/renderer/features/loops/`: `loops-store.ts`
  (MobX), a create form, a control-panel view, and a sidebar entry — all gated on the
  flag.

## Non-Goals

Do NOT build any of the following (they are the abandoned ceremony — building them fails
the task):

- Clean-room E2E gate / disposable worktree recreation / feature-snapshot service /
  cleanup journal.
- Evidence store, "attestation", "authority", "ledger", write-ahead snapshots, CAS
  reconciliation, or retained "actual identities".
- Native in-app browser verifier / webview host / browser lease protocol (browser
  checks are out of scope for this version; verification is unit tests + gh only).
- A separate "review gate" or "terminal E2E gate" phase kind. Phase kind is just `work`.
- Partial unique indexes / typed concurrent-creation conflict handling for primary loops.
- More than one DB migration, backfill migrations, or committed fixture `.db` files.
- Disposable Convex/Vercel backends, secret projection, or any cloud provisioning.
- New generic abstraction layers, plugin registries, or config for hypothetical future
  phase kinds. Add a thing when a task needs it, not before.

## Verification Contract

The loop lifecycle is provable with zero external services because `phase-runner.ts` and
`loop-service.ts` take injected dependencies:

- Feed `FakeLoopDriver` canned assistant text containing sentinels
  (`<<<LOOP:PHASE_DONE>>>` / `<<<LOOP:PHASE_FAILED>>>`) to deterministically exercise:
  pass-first-try, retry-then-pass, 3-attempt cap → phase failed → loop paused,
  verifier-fail → retry, and cancel mid-turn.
- Run verifiers against a temp git repo in `os.tmpdir()` with a fake local execution
  context to prove success/non-zero-exit/timeout and output capture.
- Prove persistence + crash-resume with the real SQLite test DB: create a `running`
  loop, call `loopService` init, assert `pauseRunningLoopsForBoot` moved it to `paused`.
- Prove the migration with the `migrations` project against fixture rows.
- Prove the UI with Agent Browser against the packaged Electron build (skip GitHub
  onboarding, enable `experiments.loops`, assert the loop surface renders).

No test may call a real coding agent, real `gh`, or the network.

## Validation Commands

- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run lint`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test`
- `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations`

### Task 1: Experiments flag (inert gate)

- [ ] Read `AGENTS.md`, `agents/conventions/typescript.md`, this whole plan, and
  `apps/emdash-desktop/src/main/core/settings/{schema.ts,settings-registry.ts}` +
  `apps/emdash-desktop/src/shared/core/app-settings.ts` before editing.
- [ ] Add an `experiments` settings group with a single boolean `loops` (default
  `false`) to `schema.ts` (`APP_SETTINGS_SCHEMA_MAP`), its default in
  `settings-registry.ts`, and its type in `@shared/core/app-settings`. Add a
  `maxLoopAttempts` number (default `3`) to the existing `tasks` settings group.
- [ ] Do NOT add any loop code yet — only the settings keys and their defaults.
- [ ] Add a unit test (in the `node` project, e.g.
  `src/main/core/settings/experiments-settings.test.ts`) asserting `experiments.loops`
  defaults to `false`, round-trips through the settings schema, and `maxLoopAttempts`
  defaults to `3`.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/settings`.

### Task 2: Shared loop domain types and config

- [ ] Create `apps/emdash-desktop/src/shared/core/loops/loops.ts` with the domain types:
  `LoopStatus`, `PhaseStatus`, `VerifierId` (`'unit-tests' | 'gh'`), `LoopPhase`
  (`id, name, goal, checks: VerifierId[], status, attempts`), `Loop`
  (`id, taskId, status, currentPhaseIndex, phases, config`), plus small type guards
  (`isLoopStatus`, `isTerminalLoopStatus`).
- [ ] Create `apps/emdash-desktop/src/shared/core/loops/loop-config.ts`: a versioned
  config schema via `defineVersionedSchema()` holding `{ provider, model }` (version
  `'1'`). Keep it minimal — no phase-kind, gate, or browser fields.
- [ ] Add `apps/emdash-desktop/src/shared/core/loops/loops.test.ts` (node project)
  covering the type guards and a config parse + version round-trip.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/shared/core/loops/loops.test.ts`.

### Task 3: Database schema, migration, and persistence operations

- [ ] Add two tables to `apps/emdash-desktop/src/main/db/schema.ts` modeled on
  `automationRuns`: `loops` (`id`, `taskId` fk, `status`, `currentPhaseIndex`,
  `config` via `versionedJsonColumn(loopConfigSchema)`, `createdAt`, `updatedAt`) and
  `loop_phases` (`id`, `loopId` fk, `orderIndex`, `name`, `goal`, `checks` JSON,
  `status`, `attempts`, timestamps). No `is_primary`, no partial unique index.
- [ ] Run `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run db:generate` and commit the ONE generated `.sql` plus the updated
  `drizzle/meta/_journal.json`. Do not hand-edit generated migration files.
- [ ] Create `apps/emdash-desktop/src/main/core/loops/operations/loop-operations.ts`
  with plain functions: `createLoop`, `getLoop`, `getLoopByTask`, `listLoops`,
  `updateLoop`, `updatePhase`. Use the `Result<T,E>` pattern only where the codebase
  already does for DB ops; otherwise return values directly.
- [ ] Add a migration test `src/main/db/tests/migrations/00NN_loops.test.ts` (migrations
  project) and a `src/main/core/loops/operations/loop-operations.db.test.ts` (main-db
  project) proving a create → read → update round-trip for a loop and its phases.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project main-db src/main/core/loops`.

### Task 4: Loop session driver interface, fake driver, and ACP driver

- [ ] Create `apps/emdash-desktop/src/main/core/loops/drivers/session-driver.ts`
  defining `LoopSessionDriver` with `runTurn(input: { taskId, conversationId?, prompt,
  signal }): Promise<{ finalText: string }>`.
- [ ] Create `drivers/fake-driver.ts` — a `FakeLoopDriver` test double that returns
  queued canned `finalText` values (used by later tests). Keep it tiny.
- [ ] Create `drivers/acp-driver.ts` — real driver: create/reuse a fresh `type:'acp'`
  conversation for the phase, call `acpSessionManager.prompt(...)`, await turn end
  (`end_turn`), and return the final assistant text. Respect the `AbortSignal` via
  `acpSessionManager.cancel`.
- [ ] Add `drivers/acp-driver.test.ts` (node) with `acpSessionManager` mocked, asserting
  it issues one prompt per `runTurn` and surfaces the final text; and a `fake-driver`
  smoke test.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/drivers`.

### Task 5: Prompt builder and sentinel parsing

- [ ] Create `apps/emdash-desktop/src/main/core/loops/prompt-builder.ts` with
  `buildPhasePrompt(phase, priorSummary?)`, `buildRetryPrompt(phase, lastFailure)`, and
  `parsePhaseOutcome(text): 'done' | 'failed' | 'unknown'` recognizing
  `<<<LOOP:PHASE_DONE>>>` and `<<<LOOP:PHASE_FAILED>>>`. Prompts instruct the agent to
  emit exactly one sentinel and to work only the current phase goal.
- [ ] Add `prompt-builder.test.ts` (node) covering both sentinels, the unknown case,
  and that a retry prompt includes the prior failure reason.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/prompt-builder.test.ts`.

### Task 6: Transport-neutral command runner and the unit-tests verifier

- [ ] Create `apps/emdash-desktop/src/main/core/loops/runtime/loop-execution-target.ts`
  that resolves a loop's task to its `{ workspaceId, path, machine }` and returns the
  existing local/SSH `IExecutionContext` + task env (reuse
  `resolve-task-workspace-target` and the execution-context factories; do not build a new
  transport).
- [ ] Create `runtime/loop-command-runner.ts` — `runCommand(ctx, cmd, { cwd, timeoutMs })`
  returning `{ exitCode, stdout, stderr, timedOut }`, honoring an `AbortSignal`.
- [ ] Create `verifiers/types.ts` (`Verifier` = `{ id, run(ctx): Promise<{ ok, output }> }`),
  `verifiers/unit-tests.ts` (runs the project's test command via the command runner), and
  `verifiers/registry.ts` (maps `VerifierId` → verifier; `unit-tests` always present).
- [ ] Add `runtime/loop-command-runner.test.ts` and `verifiers/unit-tests.test.ts` (node)
  driving a temp git repo in `os.tmpdir()` with a fake local execution context; cover a
  passing command, a non-zero exit, and a timeout.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/runtime src/main/core/loops/verifiers`.

### Task 7: Optional gh verifier

- [ ] Create `apps/emdash-desktop/src/main/core/loops/verifiers/gh.ts` — an OPTIONAL
  verifier that runs a single `gh` check command (e.g. `gh pr checks` for the branch)
  through the command runner and maps its exit code to `{ ok, output }`. It must be
  best-effort: a missing `gh` or no-PR condition returns a non-blocking skip, not a hard
  failure. Register it in `verifiers/registry.ts`.
- [ ] Add `verifiers/gh.test.ts` (node) with the command runner faked, covering success,
  failing checks, and the `gh`-absent skip path. No real `gh` invocation.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/verifiers/gh.test.ts`.

### Task 8: PhaseRunner attempt state machine

- [ ] Create `apps/emdash-desktop/src/main/core/loops/phase-runner.ts` exposing
  `runPhase(deps, loop, phaseIndex, signal)` where `deps` are injected
  (`updatePhase`, `driver`, `getVerifier`, `getDiff`, `maxAttempts`). Per attempt (up to
  `maxAttempts`, default 3): build the prompt, `driver.runTurn`, `parsePhaseOutcome`,
  and if `done` run every selected verifier in order (`unit-tests` first); pass only when
  all are `ok`. Persist the phase transition (`running`→`verifying`→`passed`/`failed`)
  each attempt. On the final failed attempt return a `failed` result. Honor the
  `AbortSignal`. Do NOT import `acpSessionManager` here — everything comes through `deps`.
- [ ] Add `phase-runner.test.ts` (node) using `FakeLoopDriver` and fake verifiers,
  covering: pass on attempt 1, fail-then-pass, 3-attempt cap → `failed`, verifier
  failure → retry, and cancel via signal.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/phase-runner.test.ts`.

### Task 9: LoopService orchestrator and crash-resume

- [ ] Create `apps/emdash-desktop/src/main/core/loops/loop-service.ts` — singleton
  `loopService`: `create(taskId, phases, config)`, `start(loopId)`, `pause`, `resume`,
  `cancel`, `retry(loopId)`. `start` walks phases from `currentPhaseIndex` calling
  `runPhase`; on pass it advances, on phase failure it sets the loop `paused`, when all
  phases pass it sets `completed`. Emit progress after each transition. Add
  `pauseRunningLoopsForBoot()` and call it from the service's `initialize()`.
- [ ] Wire the real `acp-driver` and `verifiers/registry` into `loopService` (the DI
  seam) but keep `phase-runner` unit-testable with fakes.
- [ ] Add `loop-service.test.ts` (node) proving a 2-phase happy path completes with the
  fake driver, and `loop-service.db.test.ts` (main-db) proving a `running` loop is moved
  to `paused` by `pauseRunningLoopsForBoot`.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/loop-service.test.ts --project main-db src/main/core/loops/loop-service.db.test.ts`.

### Task 10: RPC controller, events, and main-process wiring

- [ ] Create `apps/emdash-desktop/src/main/core/loops/controller.ts` via
  `createRPCController({...})` exposing `create`, `start`, `pause`, `resume`, `cancel`,
  `retry`, `getLoop`, `getLoopByTask`, `listLoops`, each delegating to `loopService`.
  Reject every mutating call when `experiments.loops` is not enabled (read the setting).
- [ ] Mount it as `loops: loopsController` in `apps/emdash-desktop/src/main/rpc.ts`, and
  call `loopService.initialize()` from `apps/emdash-desktop/src/main/index.ts` boot.
- [ ] Create `apps/emdash-desktop/src/shared/events/loopEvents.ts` with
  `loopUpdatedChannel` and `loopProgressChannel` (`defineEvent`), and emit them from
  `loopService` via `@main/lib/events`.
- [ ] Add `controller.test.ts` (node) asserting: methods delegate to a mocked
  `loopService`, and mutating calls are rejected when the flag is off.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck` and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/main/core/loops/controller.test.ts`.

### Task 11: Renderer loops store

- [ ] Create `apps/emdash-desktop/src/renderer/features/loops/loops-store.ts` — a MobX
  store that subscribes to `loopUpdatedChannel` / `loopProgressChannel` (filtering by
  loop/task id), exposes observable loop + phases state and derived flags
  (`isRunning`, `canPause`, `canResume`, `canRetry`), and actions calling
  `rpc.loops.*`. Push unsubscribes into `_unsubs[]` disposed in `dispose()`.
- [ ] Add `loops-store.test.ts` (node) with `rpc` and `events` mocked, covering an event
  updating observable state and an action invoking the right rpc method.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/renderer/features/loops/loops-store.test.ts`.

### Task 12: Renderer create-loop UI

- [ ] Create `apps/emdash-desktop/src/renderer/features/loops/create-loop-form.tsx` and a
  `create-loop-form-model.ts`: choose the task, add/remove/reorder phases (name + goal),
  toggle the `gh` check (`unit-tests` is always on and shown as fixed), and pick the
  model. Submit calls `rpc.loops.create` + `rpc.loops.start`. Register the entry point
  (modal in `src/renderer/app/modal-registry.ts` or a section) and gate its visibility on
  `useAppSettingsKey('experiments').loops`.
- [ ] Add `create-loop-form-model.test.ts` (node) covering add/remove/reorder phases and
  that `unit-tests` cannot be removed.
- [ ] Browser-verify per `.ralphex/prompts/task.txt` STEP 2.5: packaged build, skip GitHub
  onboarding, enable `experiments.loops` in Settings, open the create-loop form, add a
  phase, and screenshot to `/tmp/emdash-e2e/task12-create-loop.png`. Assert the form and
  its phase row exist via `eval` before the screenshot.
- [ ] Run: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop exec vitest run --project node src/renderer/features/loops/create-loop-form-model.test.ts`.

### Task 13: Loop control panel, sidebar entry, end-to-end smoke, and docs

- [ ] Create `apps/emdash-desktop/src/renderer/features/loops/loop-view.tsx` (loop status
  header, ordered phase list with per-phase status + attempt count, and
  pause/resume/cancel/retry buttons wired to the store) and
  `sidebar-loops-section.tsx` (lists the task's loop, gated on the flag). Register the
  view in `src/renderer/app/view-registry.ts` if a dedicated view is used.
- [ ] Add an in-process end-to-end test (node or main-db) that creates a 2-phase loop and
  runs `loopService.start` with `FakeLoopDriver` + a stub passing verifier, asserting the
  loop reaches `completed` and both phases are `passed`.
- [ ] Add a short `agents/integrations/loops.md` documenting the feature, the flag, the
  file map, and the Non-Goals; link it from `AGENTS.md` "Further Reading".
- [ ] Add a guard test `src/main/core/loops/non-goals.test.ts` that fails if any of these
  path fragments exist under `src/`: `clean-room`, `evidence`, `attestation`,
  `native-browser`, `review-gate`, `loop-ledger`. This keeps the ceremony from returning.
- [ ] Browser-verify the control panel renders with its buttons (packaged build, flag on),
  screenshot to `/tmp/emdash-e2e/task13-control-panel.png`.
- [ ] Run the full gate: `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run typecheck`,
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm run lint`,
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test`, and
  `PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run test:migrations`.

## Success Criteria

A user with `experiments.loops` enabled can create a loop on a task with an ordered list
of phases, start it, and watch each phase run a fresh ACP agent turn that is gated on unit
tests (and optionally `gh`), retrying up to 3 times before the loop pauses. Pause, resume,
cancel, and retry all work, and a running loop survives an app restart by resuming as
paused. With the flag off, no loop UI renders and loop mutation RPCs are rejected. The
entire feature is delivered in roughly 10-15 source files plus their tests, with none of
the `## Non-Goals` ceremony present, and the full `## Validation Commands` gate passes with
no network or external services.
