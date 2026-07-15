import { ok, err } from '@emdash/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLoopDriver } from './fake-driver';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  hydrateConversation: vi.fn(),
  prompt: vi.fn(),
  cancel: vi.fn(),
  getChatHistory: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@main/core/conversations/createConversation', () => ({
  createConversation: mocks.createConversation,
}));

vi.mock('@main/core/conversations/hydrateConversation', () => ({
  hydrateConversation: mocks.hydrateConversation,
}));

vi.mock('@main/core/acp/production-acp-session-manager', () => ({
  acpSessionManager: {
    prompt: mocks.prompt,
    cancel: mocks.cancel,
    getChatHistory: mocks.getChatHistory,
  },
}));

vi.mock('@main/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mocks.limit,
        }),
      }),
    }),
  },
}));

vi.mock('@main/db/schema', () => ({ tasks: {} }));

import { AcpLoopDriver } from './acp-driver';

function assistantHistory(text: string) {
  return {
    turns: [
      {
        updates: [
          { seq: 0, update: { kind: 'thinking', messageId: null, text: 'hmm' } },
          { seq: 1, update: { kind: 'message', role: 'assistant', messageId: 'a', text } },
        ],
      },
    ],
    complete: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue([{ projectId: 'proj-1' }]);
  mocks.createConversation.mockResolvedValue({ id: 'conv-1' });
  mocks.hydrateConversation.mockResolvedValue(undefined);
  mocks.prompt.mockResolvedValue(ok(undefined));
  mocks.cancel.mockResolvedValue(ok(undefined));
});

describe('FakeLoopDriver', () => {
  it('returns queued finalText values in order and records prompts', async () => {
    const driver = new FakeLoopDriver(['first', 'second']);
    const signal = new AbortController().signal;

    const a = await driver.runTurn({ taskId: 't', prompt: 'p1', signal });
    const b = await driver.runTurn({ taskId: 't', prompt: 'p2', signal });

    expect(a.finalText).toBe('first');
    expect(b.finalText).toBe('second');
    expect(driver.prompts).toEqual(['p1', 'p2']);
  });
});

describe('AcpLoopDriver', () => {
  it('creates a fresh conversation, prompts, and returns final assistant text', async () => {
    mocks.getChatHistory.mockReturnValue(assistantHistory('done <<<LOOP:PHASE_DONE>>>'));
    const driver = new AcpLoopDriver({ provider: 'claude' });

    const result = await driver.runTurn({
      taskId: 'task-1',
      prompt: 'work the phase',
      signal: new AbortController().signal,
    });

    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0]).toMatchObject({
      projectId: 'proj-1',
      taskId: 'task-1',
      type: 'acp',
      provider: 'claude',
    });
    expect(mocks.hydrateConversation).toHaveBeenCalledWith('proj-1', 'task-1', expect.any(String));
    expect(mocks.prompt).toHaveBeenCalledWith(expect.any(String), 'work the phase');
    expect(result.finalText).toBe('done <<<LOOP:PHASE_DONE>>>');
  });

  it('reuses an existing conversation id without creating one', async () => {
    mocks.getChatHistory.mockReturnValue(assistantHistory('ok'));
    const driver = new AcpLoopDriver();

    await driver.runTurn({
      taskId: 'task-1',
      conversationId: 'existing-conv',
      prompt: 'p',
      signal: new AbortController().signal,
    });

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.hydrateConversation).toHaveBeenCalledWith('proj-1', 'task-1', 'existing-conv');
    expect(mocks.prompt).toHaveBeenCalledWith('existing-conv', 'p');
  });

  it('throws when the ACP prompt fails', async () => {
    mocks.prompt.mockResolvedValue(err({ type: 'prompt_failed' }));
    const driver = new AcpLoopDriver();

    await expect(
      driver.runTurn({ taskId: 'task-1', prompt: 'p', signal: new AbortController().signal })
    ).rejects.toThrow(/prompt_failed/);
  });

  it('cancels the session when the signal aborts mid-turn', async () => {
    const controller = new AbortController();
    mocks.getChatHistory.mockReturnValue(assistantHistory('ok'));
    mocks.prompt.mockImplementation(async () => {
      controller.abort();
      return ok(undefined);
    });
    const driver = new AcpLoopDriver();

    await driver.runTurn({ taskId: 'task-1', prompt: 'p', signal: controller.signal });

    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });
});
