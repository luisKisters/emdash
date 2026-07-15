/**
 * Seam between the loop phase state machine and the thing that actually runs an
 * agent turn. `phase-runner.ts` depends only on this interface so it can be
 * unit-tested with `FakeLoopDriver`; the real implementation lives in
 * `acp-driver.ts`.
 */
export interface LoopTurnInput {
  taskId: string;
  /** Reuse an existing conversation instead of creating a fresh one. */
  conversationId?: string;
  prompt: string;
  /** Aborts the turn (cancels the underlying agent). */
  signal: AbortSignal;
}

export interface LoopTurnResult {
  /** The final assistant text of the turn (used for sentinel parsing). */
  finalText: string;
}

export interface LoopSessionDriver {
  runTurn(input: LoopTurnInput): Promise<LoopTurnResult>;
}
