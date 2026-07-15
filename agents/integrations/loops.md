# Loops

A **loop** attaches an ordered list of **phases** to a task and runs them one at a
time. Each phase spins up a **fresh ACP agent turn**; the phase **passes** only when
the agent reports done (`<<<LOOP:PHASE_DONE>>>`) AND every selected verifier is green.
A failing phase retries in place up to 3 times (`tasks.maxLoopAttempts`), then the loop
pauses. The whole surface is behind the `experiments.loops` flag (default OFF) and is
inert when off.

## Flag

- `experiments.loops` (boolean, default `false`) — gates all loop UI and mutation RPCs.
  Renderer reads it via `useAppSettingsKey('experiments').value?.loops`; the RPC
  controller rejects mutating calls when off. Turning it off mid-run pauses the loop.
- `tasks.maxLoopAttempts` (number, default `3`) — per-phase attempt cap.

## Verifiers

Every verifier delegates to infrastructure emdash already has — none shell out for
verification:

- `unit-tests` — always included, runs first. Runs the project's test command in the
  task workspace via the loop command runner over the task's local/SSH execution context.
- `github` — optional. Reads PR CI status for the task's branch/PR through emdash's
  connected GitHub account (`prSyncEngine.syncChecks` / `getOctokit`). Passes when checks
  are complete and none failed; **non-blocking skip** when there is no connected account
  or no PR yet; fails only when a check actually failed.
- `browser` — optional. Resolves the task's ready preview URL from
  `previewServerService`, loads it in emdash's existing in-app browser
  (`browserWebContentsRegistry.verifyUrl`), and asserts the page loaded (title non-empty
  and/or a configured selector present). **Non-blocking skip** when no ready URL or no
  bound browser exists.

A `skipped` verifier counts as `ok`. Phase pass = sentinel done AND all selected
verifiers `ok`.

## File map

- Shared contracts: `src/shared/core/loops/{loops.ts,loop-config.ts}`,
  `src/shared/events/loopEvents.ts`.
- Main domain `src/main/core/loops/`:
  - `loop-service.ts` (pure `LoopService`) + `production-loop-service.ts` (wired singleton).
  - `phase-runner.ts` — per-phase attempt state machine (injected deps; no
    `acpSessionManager` import).
  - `drivers/{session-driver,fake-driver,acp-driver}.ts` — turn driver seam + real ACP
    driver.
  - `prompt-builder.ts` — phase/retry prompts and sentinel parsing.
  - `runtime/{loop-execution-target,loop-command-runner}.ts` — resolve + run commands.
  - `verifiers/{types,registry,unit-tests,github,browser}.ts`.
  - `github/loop-github-context.ts` — repo/PR facts + token via existing GitHub services.
  - `operations/loop-operations.ts` — DB CRUD; tables `loops` + `loop_phases` in
    `src/main/db/schema.ts`.
  - `controller.ts` — `loops` RPC namespace (mounted in `src/main/rpc.ts`).
- Renderer `src/renderer/features/loops/`: `loops-store.ts` (MobX), `create-loop-form.tsx`
  (+ model), `loop-view.tsx` (control panel), `sidebar-loops-section.tsx` (flag-gated).

## Non-Goals

Do NOT rebuild the abandoned "loops v2" ceremony: no clean-room/disposable-worktree gate,
evidence store, attestation, ledger, CAS/write-ahead machinery, new in-app browser
subsystem or browser "lease protocol", raw `gh` CLI verifier, separate review/e2e gate
phase kinds, partial unique indexes, or extra migrations. Reuse existing emdash services
at every seam. See `docs/plans/acp-loops-v2-ralphex.md` `## Non-Goals` for the full list.
