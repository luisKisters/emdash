import { describe, expect, it, vi } from 'vitest';
import type { IExecutionContext } from '@main/core/execution-context/types';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import type { Loop, LoopPhase } from '@shared/core/loops/loops';
import { FakeLoopDriver } from './drivers/fake-driver';
import { LoopService, type LoopOps } from './loop-service';
import type { Verifier } from './verifiers/types';

const DONE = '<<<LOOP:PHASE_DONE>>>';

const config: LoopConfig = { version: '1', provider: 'claude', model: '' };

const stubCtx = {
  supportsLocalSpawn: true,
  exec: vi.fn(),
  execStreaming: vi.fn(),
  dispose: vi.fn(),
} as unknown as IExecutionContext;

const passingVerifier: Verifier = {
  id: 'unit-tests',
  run: async () => ({ ok: true, output: 'green' }),
};

/** In-memory `LoopOps` backed by a plain object graph — no SQLite. */
function makeMemoryOps(loop: Loop): LoopOps {
  const state: Loop = structuredClone(loop);
  return {
    createLoop: vi.fn(),
    getLoop: async (id) => (id === state.id ? structuredClone(state) : null),
    getLoopByTask: async (taskId) => (taskId === state.taskId ? structuredClone(state) : null),
    listLoops: async () => [structuredClone(state)],
    updateLoop: async (id, patch) => {
      if (id !== state.id) return null;
      Object.assign(state, patch);
      return structuredClone(state);
    },
    updatePhase: async (phaseId, patch) => {
      const phase = state.phases.find((p) => p.id === phaseId);
      if (!phase) return null;
      Object.assign(phase, patch);
      return structuredClone(phase);
    },
  };
}

function makePhase(id: string, name: string): LoopPhase {
  return { id, name, goal: `goal ${name}`, checks: ['unit-tests'], status: 'pending', attempts: 0 };
}

function baseLoop(): Loop {
  return {
    id: 'loop-1',
    taskId: 'task-1',
    status: 'draft',
    currentPhaseIndex: 0,
    phases: [makePhase('p1', 'One'), makePhase('p2', 'Two')],
    config,
  };
}

function makeService(ops: LoopOps, driver: FakeLoopDriver) {
  return new LoopService({
    ops,
    driverFor: () => driver,
    getVerifier: (id) => (id === 'unit-tests' ? passingVerifier : undefined),
    getMaxAttempts: async () => 3,
    resolveVerifierContext: async () => ({ ctx: stubCtx, cwd: '/tmp/ws' }),
  });
}

describe('LoopService', () => {
  it('completes a 2-phase happy path, passing every phase', async () => {
    const ops = makeMemoryOps(baseLoop());
    const driver = new FakeLoopDriver([`done ${DONE}`, `done ${DONE}`]);
    const service = makeService(ops, driver);

    await service.start('loop-1');

    const loop = await ops.getLoop('loop-1');
    expect(loop?.status).toBe('completed');
    expect(loop?.currentPhaseIndex).toBe(2);
    expect(loop?.phases.map((p) => p.status)).toEqual(['passed', 'passed']);
    expect(driver.prompts).toHaveLength(2);
  });

  it('pauses the loop when a phase fails all attempts', async () => {
    const ops = makeMemoryOps(baseLoop());
    const driver = new FakeLoopDriver(['no sentinel', 'still nothing', 'nope']);
    const service = makeService(ops, driver);

    await service.start('loop-1');

    const loop = await ops.getLoop('loop-1');
    expect(loop?.status).toBe('paused');
    expect(loop?.phases[0]?.status).toBe('failed');
    expect(loop?.currentPhaseIndex).toBe(0);
  });

  it('pauseRunningLoopsForBoot moves running loops to paused', async () => {
    const running = { ...baseLoop(), status: 'running' as const };
    const ops = makeMemoryOps(running);
    const service = makeService(ops, new FakeLoopDriver([]));

    await service.pauseRunningLoopsForBoot();

    expect((await ops.getLoop('loop-1'))?.status).toBe('paused');
  });
});
