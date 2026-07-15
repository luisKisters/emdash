import type { IExecutionContext } from '@main/core/execution-context/types';
import type { VerifierId } from '@shared/core/loops/loops';

export interface VerifierRunInput {
  taskId: string;
  /** Execution context rooted at the task workspace (from `loop-execution-target`). */
  ctx: IExecutionContext;
  /** Working directory for commands (usually the workspace path). */
  cwd: string;
  signal: AbortSignal;
}

export interface VerifierResult {
  ok: boolean;
  /** A non-blocking skip (e.g. no PR / no preview URL). Counts as `ok`. */
  skipped?: boolean;
  output: string;
}

export interface Verifier {
  id: VerifierId;
  run(input: VerifierRunInput): Promise<VerifierResult>;
}
