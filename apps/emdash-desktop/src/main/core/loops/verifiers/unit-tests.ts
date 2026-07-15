import { runCommand } from '../runtime/loop-command-runner';
import type { Verifier } from './types';

/** Default test command when the project does not configure one. */
export const DEFAULT_TEST_COMMAND = 'npm test';

/** Default per-run timeout for the test command (10 minutes). */
export const DEFAULT_TEST_TIMEOUT_MS = 10 * 60 * 1000;

export interface UnitTestsVerifierOptions {
  command?: string;
  timeoutMs?: number;
}

/**
 * The always-on verifier: runs the project's test command in the task workspace
 * and passes only on a clean (exit 0, not timed out) run.
 */
export function createUnitTestsVerifier(options: UnitTestsVerifierOptions = {}): Verifier {
  const command = options.command ?? DEFAULT_TEST_COMMAND;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;

  return {
    id: 'unit-tests',
    async run(input) {
      const result = await runCommand(input.ctx, command, {
        cwd: input.cwd,
        timeoutMs,
        signal: input.signal,
      });
      const ok = result.exitCode === 0 && !result.timedOut;
      const output = result.timedOut
        ? `test command timed out after ${timeoutMs}ms`
        : `${result.stdout}${result.stderr}`.trim();
      return { ok, output };
    },
  };
}
