# Loops: plan-driven task creation

## Outcome

A user selects or pastes a plan, leaves the Create Task modal, reviews repository-detected
verification on a dedicated full-screen Loop setup screen, and creates the task. The task opens
immediately. A persisted planning conversation converts the plan into Loop phases in the task
workspace.

## Current implementation status

- Implemented: current-repository verifier detection, Summario and notetakr fixtures, common
  fallback rules, Plan file authoring, full-screen Verification, exact disabled reasons, planning
  conversation, Preparing/Retry states, and optimistic task/Loop-tab opening.
- Hardened after review: read-only ACP planning, permission denial, realpath containment, a fixed
  512 KiB plan limit, delimiter-safe prompt data, and isolated post-create notifications.
- Verified in the built Electron app: Summario and notetakr detection, Plan file selection,
  full-screen Verification, disabled reason, Preparing, live planning chat, and final phases.
- HTML and app screenshots are stored next to the mockup. The local Emdash Dev app was replaced with
  commit `fbc619b43` and passed a short Agent Browser smoke check over remote debugging.
- Known database gap: Drizzle Kit 0.24.2 does not generate a migration when only the SQLite Loop
  status `CHECK` changes. The application schema and lifecycle support the new statuses, but the DB
  constraint cannot be updated without a manual migration or a dependency upgrade. Do not hand-edit
  generated Drizzle files.
- Known transcript gap: the planning prompt and live thought state appear during Preparing. The
  provider replay does not restore the final assistant JSON after completion. Phase generation and
  Loop state are not affected. Do not add a second transcript system to solve this in this slice.

This change extends the existing Create Task modal and Loop engine. It must not create a second
task-creation flow, chat system, workspace resolver, file-system abstraction, verifier runner, or
browser automation path.

## Product flow

1. The existing Create Task screen adds **Plan file** to **Based on**.
2. Selecting a plan enables **Create with Loop** and changes the primary action to **Continue**.
3. Continue closes the Create Task modal and opens a dedicated full-screen **Verification** screen
   inside the existing Emdash app shell. Verification is not a modal step or modal-sized card.
4. Verification shows detected repository checks, preselects the effective checks, and lets the
   user add a custom verifier by name.
   It shows checks for the current project only. It never shows a repository chooser or demo tabs.
5. Back restores the Create Task screen without losing selections. Create persists the task, Loop
   shell, and one planning conversation atomically.
6. The task and Loop tab become visible before workspace provisioning or planning finishes.
7. Planning waits for the task workspace, runs read-only, streams in the existing conversation UI,
   and atomically replaces the empty phase set when its bounded structured reply is valid.

## Deliberate exclusions

- No live chat on the pre-create Verification screen. The existing ACP chat is bound to a persisted
  task and conversation. Supporting it before Create would require temporary task/session cleanup,
  recovery, and ownership rules. A composer-shaped input without a real conversation would be
  misleading.
- No generic wizard framework. Add only the smallest renderer navigation state needed to leave the
  modal, show Verification full-screen, preserve the draft, and return with Back.
- No new provider capability or verifier execution system.
- No replacement for `validationCommands`; it remains the low-risk engine seam.
- No true token-by-token phase streaming protocol. The planning chat streams normally; phases are
  committed together and existing phase events update the Loop UI.
- No Claude Loop creation in this slice. New Loops remain explicitly Codex-backed.

## Minimal implementation rules

1. Reuse the current Create Task controls for authoring. Build Verification from existing app-shell,
   tab-bar, field, checkbox, and button primitives. Do not imitate full-screen layout inside a large
   `Dialog`.
2. Keep the draft in the narrowest existing renderer owner that survives modal close and Back. Do
   not add a general form store, wizard engine, route framework, or durable database draft.
3. Keep detection pure over `IFileSystem`. Resolve the project provider once in the controller. Do
   not use local Node file APIs or local process checks for SSH projects.
4. Add `verifierPlan` as an optional backward-compatible field in Loop config v2, as requested. Do
   not add a new DB column or change an existing required field.
5. Keep task, Loop shell, and planning conversation creation in the current transaction. Hydrate
   that conversation; do not create a second row in the driver.
6. Provision through `taskService.provisionWorkspace`. Do not add a competing provision path or
   poll from the renderer.
7. Store preparation conversation ID, status, and error durably. On boot, settle interrupted
   preparation as `prepare-failed`. Retry reuses the same conversation and one logical session
   record.
8. Run the planning session read-only. Do not copy the phase runner's blanket permission approval.
9. Replace phases and update `verifierPlan`, derived `validationCommands`, acceptance criteria, and
   Loop status in one transaction. Emit existing Loop and phase events after commit.
10. Guard start with `assertLoopRunnable`, including the zero-phase case. Keep the zero-phase runtime
   guard as defense in depth.
11. Derive one precise disabled reason from existing task-name, workspace, provider, and model state.
    Do not duplicate workspace validity logic in the button component.

## Detection rule set

Summario and notetakr are fixtures and sources for the default rule set. They are not selectable
presets in the product UI. Detection always runs against the current project root.

Use a short, deterministic rule list. Add a fallback only when its signal is unambiguous:

| Signal | Selected command or entry |
| --- | --- |
| Executable `scripts/verify*.sh` or `e2e-smoke.sh` | Repository gate; rank first |
| `package.json` scripts `test`, `test:e2e`, `lint`, `typecheck`, `build`, `format` | Use the repository package manager |
| Aggregate script such as summario `test:phase` | Select it and suppress members it invokes |
| `vitest` dependency/config without a test script | `vitest run` |
| Jest dependency/config without a test script | `jest --runInBand` |
| Playwright dependency/config without an E2E script | `playwright test` |
| Cypress dependency/config without an E2E script | `cypress run` |
| ESLint config without a lint script | `eslint .` |
| Biome config without lint/format scripts | `biome check .` |
| TypeScript dependency plus `tsconfig.json` without a typecheck script | `tsc --noEmit` |
| `pytest.ini`, `pyproject.toml` pytest config, or pytest dependency | `python -m pytest` |
| Ruff config without a lint script | `ruff check .` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |
| `Package.swift` with `.testTarget` | `swift test` |
| Xcode project plus UI-test target | `xcodebuild test -only-testing:…` |
| Convex dependency plus directory | Existing Convex dry-run check |
| Nested package manifest | Same rules with an explicit safe working directory |
| CI `run:` line | Fill a missing command or establish ordering; never duplicate it |

Always add one provider-labelled browser entry. Selecting it updates both existing browser-preview
and E2E terminal-gate fields. Do not add provider capabilities or a new runner.

## Models

- Implementation: `gpt-5.6-sol`, medium reasoning.
- Focused test and screen comparison: `gpt-5.6-sol`, medium reasoning.
- Final review: `gpt-5.6-sol`, medium reasoning, narrow scope and minimal test execution.

## Phase 1: Verifier detection and authoring inputs

### Task 1.1: Shared catalog and pure detector

- Add the shared detected and selected verifier types.
- Implement detection as pure rules over `IFileSystem`; local and SSH projects use the same path.
- Detect only the current project. Do not return fixture repositories, presets, or repository tabs.
- Implement stable IDs, deterministic order, aggregate suppression, nested working directories, and
  provider-labelled browser entry.
- Add focused fixtures that represent summario and notetakr plus one small fixture for each added
  common fallback family. One test may cover several rules; do not create one test per file probe.

### Task 1.2: RPC and plan source

- Fold availability into `loopsController.detectVerifiers({ projectId, provider })`.
- List Markdown plan files through the existing project/workspace search path.
- Read the selected plan through the existing workspace/project `IFileSystem` path.
- Do not add preload methods, direct Node renderer access, or a second file index.

### Task 1.3: Disabled reason

- Return one `disabledReason` next to `canCreate`.
- Cover missing project, empty or pending generated name, unsupported/missing Loop provider or model,
  branch conflict, existing branch, missing PR preset data, and missing workspace selection.
- Show the exact reason in the existing confirmation tooltip and inline footer text.

## Phase 2: Loop shell and planning lifecycle

### Task 2.1: Backward-compatible state

- Add optional `verifierPlan` to Loop config v2. Old rows parse without it; new authoring writes it.
- Add `preparing` and `prepare-failed` plus durable preparation conversation/error fields.
- Ask Drizzle Kit to generate the status-constraint migration. Never edit numbered SQL or metadata
  manually.
- If the pinned generator reports no schema change, keep the DB constraint as an explicit blocked
  integrity layer. Do not widen scope to a Drizzle upgrade without a separate decision.

### Task 2.2: Shell creation and runnable guard

- Split shell validation from start-time runnable validation.
- Permit zero phases and unresolved custom commands only while draft/preparing.
- Reject them at start and explicitly prevent zero-phase self-completion at runtime.
- Add one atomic phase-replacement operation that also updates resolved config and emits existing
  Loop/phase events only after commit.

### Task 2.3: Planning protocol and persisted conversation

- Reuse the ACP driver/session stack with a target-based session context instead of fabricating a
  Loop phase.
- Create exactly one persisted planning conversation in the existing task transaction.
- Use a read-only, approximately 90-second planning prompt. Wrap plan text as untrusted data.
- Parse one bounded delimited JSON payload with distinct missing, duplicate, oversized, JSON, and
  schema errors.
- Retry in the same conversation. On restart, settle interrupted preparation as failed.
- Keep the existing conversation ban for non-planning purposes.

## Phase 3: Full-screen Verification and preparing UI

### Task 3.1: Create Task authoring

- Add Plan file as the third Based-on value and keep paste fallback.
- Selecting a plan enables Loop and changes the modal action to Continue.
- Continue closes the modal and opens one full-screen Verification surface in the existing app shell.
- Preserve the transient draft and Back behavior in the narrowest existing state owner. Do not add a
  generic wizard, generic form store, database draft, or second creation service.

### Task 3.2: Verifier picker

- Show only the current project's detected checks, grouped by class and preselected.
- Show suppressed checks as covered and unselected. Never render repo tabs or fixture names.
- Add one name-only custom verifier row. Derive legacy `validationCommands` from selected commands.
- Keep deprecated `verifiers` written as an empty array.

### Task 3.3: Create and preparation feedback

- Create task, shell Loop, and planning conversation atomically, then open the task immediately.
- Render Preparing, failure reason, Retry, clickable planning chat, and final phases with existing
  task-tab and conversation components.
- Do not add a chat to the pre-create Verification screen.

## Phase 4: Electron proof and harness

### Task 4.1: Scripted proof

- Extend the existing Loops Electron harness only where needed for Plan file, current-project
  detection, custom verifier, Preparing, planning chat, failure Retry, and final phases.
- Keep the harness test-only and behind `EMDASH_LOOPS_ELECTRON_TEST=1`.

### Task 4.2: Real UI comparison

- Run the built dev app with an isolated database and remote debugging.
- Use agent-browser over the remote debugging port for summario, then notetakr.
- Capture Create Task, plan selection, disabled reason, full-screen Verification, Preparing, planning
  chat, and final phases.
- Compare these screenshots with the HTML mockup at the same viewport. Fix material structure,
  spacing, theme, text, state, or navigation differences before handoff.

## Validation policy

- During implementation, run only the smallest adjacent test file for the changed behavior.
- Do not execute long generated test plans or repeat the full workspace suite.
- Use one small built-Electron smoke flow at the end. Cover Summario and notetakr in the same app
  session where possible.
- Run broad static checks only once when the change scope requires them. The completed integration
  already passed format, typecheck, and lint.

## Acceptance evidence

- Detector output from real summario and notetakr fixture trees, with no repository selector in UI.
- Unit evidence for disabled reasons, parser failure classes, shell/runnable guards, zero-phase runtime
  behavior, atomic replacement, retry/restart, and backward-compatible config reads.
- Renderer evidence that Continue leaves the modal, Verification is full-screen, Back preserves the
  draft, and only current-project checks render.
- Passing existing migration tests, plus a documented blocker if the pinned generator cannot emit
  the status-constraint change.
- Headless Chrome screenshots for every HTML panel.
- Real Electron screenshots and an agent-browser action log for summario and notetakr.

## Focused verification set

- Detector fixtures cover Summario, notetakr, aggregate suppression, generated-tree exclusion, and
  deterministic ordering.
- Parser tests cover valid, missing, duplicate, oversized, and schema-invalid replies.
- Lifecycle tests cover shell creation, runnable guards, zero phases, preparation, retry, and atomic
  replacement.
- Renderer tests cover full-screen navigation, state preservation, disabled reasons, and Loop-tab
  opening.
- One Agent Browser pass supplies the final UI evidence. Do not turn this list into a long plan that
  executes application work or repository verifiers.
- Real Electron proof for summario and notetakr through the existing Loops harness.
- Final repository format, lint, typecheck, test, migration, and fixture gates.

## Mockup gate

The implementation must match `docs/mockups/loops-create/index.html`. App code starts only after the
Create Task screen, dedicated full-screen Verification surface, disabled state, and Preparing task
view receive human sign-off.
