import type { LoopSessionDriver, LoopTurnInput, LoopTurnResult } from './session-driver';

/**
 * Test double for `LoopSessionDriver`. Returns queued `finalText` values in FIFO
 * order — one per `runTurn` call — so tests can script agent outcomes (sentinels)
 * without a real agent. Records the prompts it was given for assertions.
 */
export class FakeLoopDriver implements LoopSessionDriver {
  readonly prompts: string[] = [];
  private readonly queue: string[];

  constructor(finalTexts: string[]) {
    this.queue = [...finalTexts];
  }

  async runTurn(input: LoopTurnInput): Promise<LoopTurnResult> {
    if (input.signal.aborted) throw new Error('aborted');
    this.prompts.push(input.prompt);
    const finalText = this.queue.shift() ?? '';
    return { finalText };
  }
}
