import type { IExecutionContext } from '@main/core/execution-context/types';
import type { Loop, LoopPhase, VerifierId } from '@shared/core/loops/loops';
import type { LoopSessionDriver } from './drivers/session-driver';
import {
  buildPhasePrompt,
  buildRetryPrompt,
  parsePhaseOutcome,
  type GithubFacts,
} from './prompt-builder';
import type { Verifier, VerifierRunInput } from './verifiers/types';

/**
 * Per-phase attempt state machine. Depends only on injected seams
 * (`updatePhase`, `driver`, `getVerifier`, `maxAttempts`) so it is unit-testable
 * with `FakeLoopDriver` + fake verifiers and never touches `acpSessionManager`.
 */
export interface PhaseRunnerDeps {
  updatePhase(
    phaseId: string,
    patch: Partial<Pick<LoopPhase, 'status' | 'attempts'>>
  ): Promise<unknown>;
  driver: LoopSessionDriver;
  getVerifier(id: VerifierId): Verifier | undefined;
  maxAttempts: number;
  /** Execution context + cwd handed to verifiers (resolved by the loop service). */
  verifierContext: { ctx: IExecutionContext; cwd: string };
  /** GitHub facts rendered into the first prompt. */
  github?: GithubFacts;
  /** Short summary of the prior phase's result. */
  priorSummary?: string;
}

export type PhaseRunStatus = 'passed' | 'failed';

export interface PhaseRunResult {
  status: PhaseRunStatus;
  attempts: number;
  lastOutput: string;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('aborted');
}

/** Orders a phase's checks so `unit-tests` always runs first. */
function orderChecks(checks: VerifierId[]): VerifierId[] {
  return [...checks].sort((a, b) => {
    if (a === 'unit-tests') return -1;
    if (b === 'unit-tests') return 1;
    return 0;
  });
}

async function runVerifiers(
  deps: PhaseRunnerDeps,
  phase: LoopPhase,
  taskId: string,
  signal: AbortSignal
): Promise<{ ok: boolean; output: string }> {
  const outputs: string[] = [];
  for (const id of orderChecks(phase.checks)) {
    throwIfAborted(signal);
    const verifier = deps.getVerifier(id);
    if (!verifier) continue;
    const input: VerifierRunInput = {
      taskId,
      ctx: deps.verifierContext.ctx,
      cwd: deps.verifierContext.cwd,
      signal,
    };
    const result = await verifier.run(input);
    const label = result.skipped ? 'skipped' : result.ok ? 'ok' : 'failed';
    outputs.push(`[${id}] ${label}: ${result.output}`);
    // A skip returns `ok: true`, so it counts as ok here.
    if (!result.ok) return { ok: false, output: outputs.join('\n') };
  }
  return { ok: true, output: outputs.join('\n') };
}

export async function runPhase(
  deps: PhaseRunnerDeps,
  loop: Loop,
  phaseIndex: number,
  signal: AbortSignal
): Promise<PhaseRunResult> {
  const phase = loop.phases[phaseIndex];
  let attempts = 0;
  let lastFailure = '';

  while (attempts < deps.maxAttempts) {
    throwIfAborted(signal);
    attempts += 1;

    await deps.updatePhase(phase.id, { status: 'running', attempts });

    const prompt =
      attempts === 1
        ? buildPhasePrompt(phase, { priorSummary: deps.priorSummary, github: deps.github })
        : buildRetryPrompt(phase, lastFailure);

    const { finalText } = await deps.driver.runTurn({ taskId: loop.taskId, prompt, signal });
    throwIfAborted(signal);

    const outcome = parsePhaseOutcome(finalText);
    if (outcome !== 'done') {
      lastFailure =
        outcome === 'failed'
          ? `Agent reported the phase failed:\n${finalText}`
          : `Agent did not emit a completion sentinel:\n${finalText}`;
      continue;
    }

    await deps.updatePhase(phase.id, { status: 'verifying', attempts });
    const verify = await runVerifiers(deps, phase, loop.taskId, signal);
    if (verify.ok) {
      await deps.updatePhase(phase.id, { status: 'passed', attempts });
      return { status: 'passed', attempts, lastOutput: verify.output };
    }
    lastFailure = `A check failed:\n${verify.output}`;
  }

  await deps.updatePhase(phase.id, { status: 'failed', attempts });
  return { status: 'failed', attempts, lastOutput: lastFailure };
}
