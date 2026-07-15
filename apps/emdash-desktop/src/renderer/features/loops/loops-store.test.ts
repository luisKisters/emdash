import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Loop } from '@shared/core/loops/loops';

const handlers = new Map<string, (data: Loop) => void>();

const mocks = vi.hoisted(() => ({
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  retry: vi.fn(async () => {}),
  getLoopByTask: vi.fn(async () => null as Loop | null),
}));

vi.mock('@renderer/lib/ipc', () => ({
  events: {
    on: (event: { name: string }, cb: (data: Loop) => void) => {
      handlers.set(event.name, cb);
      return () => handlers.delete(event.name);
    },
  },
  rpc: {
    loops: {
      pause: mocks.pause,
      resume: mocks.resume,
      cancel: mocks.cancel,
      retry: mocks.retry,
      getLoopByTask: mocks.getLoopByTask,
    },
  },
}));

import { LoopsStore } from './loops-store';

function makeLoop(overrides: Partial<Loop> = {}): Loop {
  return {
    id: 'loop-1',
    taskId: 'task-1',
    status: 'running',
    currentPhaseIndex: 0,
    phases: [],
    config: { version: '1', provider: 'claude', model: 'sonnet' },
    ...overrides,
  };
}

describe('LoopsStore', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it('updates observable state from a matching loop event', () => {
    const store = new LoopsStore('task-1');
    handlers.get('loop:updated')!(makeLoop({ status: 'running' }));
    expect(store.loop?.id).toBe('loop-1');
    expect(store.isRunning).toBe(true);
    expect(store.canPause).toBe(true);
    expect(store.canResume).toBe(false);
    store.dispose();
  });

  it('ignores events for other tasks', () => {
    const store = new LoopsStore('task-1');
    handlers.get('loop:progress')!(makeLoop({ taskId: 'other-task' }));
    expect(store.loop).toBeNull();
    store.dispose();
  });

  it('derives control flags from status', () => {
    const store = new LoopsStore('task-1');
    handlers.get('loop:updated')!(makeLoop({ status: 'paused' }));
    expect(store.canResume).toBe(true);
    expect(store.canRetry).toBe(true);
    expect(store.canPause).toBe(false);

    handlers.get('loop:updated')!(makeLoop({ status: 'failed' }));
    expect(store.canRetry).toBe(true);
    expect(store.canResume).toBe(false);
    store.dispose();
  });

  it('actions invoke the matching rpc method with the loop id', () => {
    const store = new LoopsStore('task-1');
    handlers.get('loop:updated')!(makeLoop());
    store.pause();
    store.resume();
    store.cancel();
    store.retry();
    expect(mocks.pause).toHaveBeenCalledWith('loop-1');
    expect(mocks.resume).toHaveBeenCalledWith('loop-1');
    expect(mocks.cancel).toHaveBeenCalledWith('loop-1');
    expect(mocks.retry).toHaveBeenCalledWith('loop-1');
    store.dispose();
  });

  it('dispose unsubscribes from every channel', () => {
    const store = new LoopsStore('task-1');
    expect(handlers.size).toBe(2);
    store.dispose();
    expect(handlers.size).toBe(0);
  });
});
