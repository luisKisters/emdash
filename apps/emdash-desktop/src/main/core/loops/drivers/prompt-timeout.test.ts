import { describe, expect, it, vi } from 'vitest';
import { ok, type Result } from '@main/lib/result';
import { sendPromptWithTimeout } from './prompt-timeout';
import type { LoopSessionDriver, LoopSessionDriverError, PromptResult } from './session-driver';

function driverWithHeldPrompt(): LoopSessionDriver {
  return {
    kind: 'acp',
    startPhaseSession: vi.fn(async () => ok({ conversationId: 'phase', title: 'phase' })),
    startVerificationSession: vi.fn(async () =>
      ok({ conversationId: 'verification', title: 'verification' })
    ),
    sendPrompt: vi.fn(
      async (): Promise<Result<PromptResult, LoopSessionDriverError>> =>
        await new Promise<Result<PromptResult, LoopSessionDriverError>>(() => {})
    ),
    cancelPrompt: vi.fn(async () => ok(undefined)),
  };
}

describe('sendPromptWithTimeout', () => {
  it('waits for cancellation to settle before returning a timeout', async () => {
    vi.useFakeTimers();
    const driver = driverWithHeldPrompt();
    const cancellation = Promise.withResolvers<Result<void, LoopSessionDriverError>>();
    driver.cancelPrompt = vi.fn(() => cancellation.promise);
    const resultPromise = sendPromptWithTimeout({
      driver,
      conversationId: 'conversation',
      prompt: 'plan',
      timeoutMs: 25,
      failureMessage: 'failed',
      timeoutLabel: 'Loop planning prompt',
    });

    await vi.advanceTimersByTimeAsync(25);
    let returned = false;
    void resultPromise.then(() => {
      returned = true;
    });
    await Promise.resolve();
    expect(returned).toBe(false);

    cancellation.resolve(ok(undefined));
    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      error: { message: 'Loop planning prompt timed out after 1s.' },
    });
    vi.useRealTimers();
  });

  it('can leave cancellation to a caller that owns session quiescence', async () => {
    vi.useFakeTimers();
    const driver = driverWithHeldPrompt();
    const resultPromise = sendPromptWithTimeout({
      driver,
      conversationId: 'conversation',
      prompt: 'verify',
      timeoutMs: 25,
      failureMessage: 'failed',
      timeoutLabel: 'Clean-room E2E prompt',
      cancelOnTimeout: false,
    });

    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(result).toMatchObject({
      success: false,
      error: { message: 'Clean-room E2E prompt timed out after 1s.' },
    });
    expect(driver.cancelPrompt).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
