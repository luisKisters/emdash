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

describe('loop end-to-end (fake driver + stub verifier)', () => {
  it('drives a 2-phase loop to completed with both phases passed', async () => {
    const loop: Loop = {
      id: 'loop-e2e',
      taskId: 'task-e2e',
      status: 'draft',
      currentPhaseIndex: 0,
      phases: [makePhase('p1', 'Build'), makePhase('p2', 'Ship')],
      config,
    };
    const ops = makeMemoryOps(loop);
    const service = new LoopService({
      ops,
      driverFor: () => new FakeLoopDriver([`working ${DONE}`, `working ${DONE}`]),
      getVerifier: (id) => (id === 'unit-tests' ? passingVerifier : undefined),
      getMaxAttempts: async () => 3,
      resolveVerifierContext: async () => ({ ctx: stubCtx, cwd: '/tmp/ws' }),
    });

    await service.start('loop-e2e');

    const result = await ops.getLoop('loop-e2e');
    expect(result?.status).toBe('completed');
    expect(result?.phases.map((p) => p.status)).toEqual(['passed', 'passed']);
  });
});
