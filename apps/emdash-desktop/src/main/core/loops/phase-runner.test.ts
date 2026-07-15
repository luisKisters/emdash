import { describe, expect, it, vi } from 'vitest';
import type { IExecutionContext } from '@main/core/execution-context/types';
import type { Loop, LoopPhase, VerifierId } from '@shared/core/loops/loops';
import { FakeLoopDriver } from './drivers/fake-driver';
import { runPhase, type PhaseRunnerDeps } from './phase-runner';
import type { Verifier, VerifierResult } from './verifiers/types';

const DONE = '<<<LOOP:PHASE_DONE>>>';
const FAILED = '<<<LOOP:PHASE_FAILED>>>';

const stubCtx = {
  supportsLocalSpawn: true,
  exec: vi.fn(),
  execStreaming: vi.fn(),
  dispose: vi.fn(),
} as unknown as IExecutionContext;

function makePhase(overrides: Partial<LoopPhase> = {}): LoopPhase {
  return {
    id: 'phase-1',
    name: 'Phase 1',
    goal: 'do the thing',
    checks: ['unit-tests'],
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

function makeLoop(phase: LoopPhase): Loop {
  return {
    id: 'loop-1',
    taskId: 'task-1',
    status: 'running',
    currentPhaseIndex: 0,
    phases: [phase],
    config: { version: '1', provider: 'claude', model: '' },
  };
}

function fakeVerifier(id: VerifierId, result: VerifierResult): Verifier {
  return { id, run: async () => result };
}

type UpdatePhaseMock = PhaseRunnerDeps['updatePhase'];

function newUpdatePhase() {
  return vi.fn<UpdatePhaseMock>(async () => undefined);
}

function baseDeps(
  driver: FakeLoopDriver,
  verifiers: Partial<Record<VerifierId, Verifier>>,
  updatePhase: ReturnType<typeof newUpdatePhase> = newUpdatePhase()
): PhaseRunnerDeps {
  return {
    updatePhase,
    driver,
    getVerifier: (id) => verifiers[id],
    maxAttempts: 3,
    verifierContext: { ctx: stubCtx, cwd: '/tmp/ws' },
  };
}

describe('runPhase', () => {
  it('passes on the first attempt when the agent is done and the verifier is ok', async () => {
    const driver = new FakeLoopDriver([`working... ${DONE}`]);
    const updatePhase = newUpdatePhase();
    const deps = baseDeps(
      driver,
      { 'unit-tests': fakeVerifier('unit-tests', { ok: true, output: 'green' }) },
      updatePhase
    );

    const result = await runPhase(deps, makeLoop(makePhase()), 0, new AbortController().signal);

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(1);
    expect(driver.prompts).toHaveLength(1);
    const statuses = updatePhase.mock.calls.map((c) => (c[1] as { status?: string }).status);
    expect(statuses).toEqual(['running', 'verifying', 'passed']);
  });

  it('retries after the agent reports failure, then passes', async () => {
    const driver = new FakeLoopDriver([`nope ${FAILED}`, `fixed ${DONE}`]);
    const deps = baseDeps(driver, {
      'unit-tests': fakeVerifier('unit-tests', { ok: true, output: 'green' }),
    });

    const result = await runPhase(deps, makeLoop(makePhase()), 0, new AbortController().signal);

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(2);
    // Second prompt is a retry prompt containing the prior failure.
    expect(driver.prompts[1]).toContain('previous attempt did not pass');
  });

  it('fails after maxAttempts when the agent never completes', async () => {
    const driver = new FakeLoopDriver([`${FAILED}`, `${FAILED}`, `${FAILED}`]);
    const updatePhase = newUpdatePhase();
    const deps = baseDeps(
      driver,
      { 'unit-tests': fakeVerifier('unit-tests', { ok: true, output: 'green' }) },
      updatePhase
    );

    const result = await runPhase(deps, makeLoop(makePhase()), 0, new AbortController().signal);

    expect(result.status).toBe('failed');
    expect(result.attempts).toBe(3);
    const statuses = updatePhase.mock.calls.map((c) => (c[1] as { status?: string }).status);
    expect(statuses.at(-1)).toBe('failed');
  });

  it('retries when the agent is done but a verifier hard-fails', async () => {
    const driver = new FakeLoopDriver([`${DONE}`, `${DONE}`]);
    let call = 0;
    const verifier: Verifier = {
      id: 'unit-tests',
      run: async () => {
        call += 1;
        return call === 1
          ? { ok: false, output: 'test failed' }
          : { ok: true, output: 'green' };
      },
    };
    const deps = baseDeps(driver, { 'unit-tests': verifier });

    const result = await runPhase(deps, makeLoop(makePhase()), 0, new AbortController().signal);

    expect(result.status).toBe('passed');
    expect(result.attempts).toBe(2);
    expect(driver.prompts[1]).toContain('A check failed');
  });

  it('treats a skipped verifier as ok', async () => {
    const driver = new FakeLoopDriver([`${DONE}`]);
    const deps = baseDeps(driver, {
      'unit-tests': fakeVerifier('unit-tests', { ok: true, output: 'green' }),
      github: fakeVerifier('github', { ok: true, skipped: true, output: 'no PR' }),
    });

    const result = await runPhase(
      deps,
      makeLoop(makePhase({ checks: ['unit-tests', 'github'] })),
      0,
      new AbortController().signal
    );

    expect(result.status).toBe('passed');
  });

  it('runs unit-tests before other checks regardless of order', async () => {
    const order: VerifierId[] = [];
    const driver = new FakeLoopDriver([`${DONE}`]);
    const track = (id: VerifierId): Verifier => ({
      id,
      run: async () => {
        order.push(id);
        return { ok: true, output: 'ok' };
      },
    });
    const deps = baseDeps(driver, { 'unit-tests': track('unit-tests'), github: track('github') });

    await runPhase(
      deps,
      makeLoop(makePhase({ checks: ['github', 'unit-tests'] })),
      0,
      new AbortController().signal
    );

    expect(order).toEqual(['unit-tests', 'github']);
  });

  it('throws when the signal is already aborted', async () => {
    const driver = new FakeLoopDriver([`${DONE}`]);
    const deps = baseDeps(driver, {
      'unit-tests': fakeVerifier('unit-tests', { ok: true, output: 'green' }),
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runPhase(deps, makeLoop(makePhase()), 0, controller.signal)
    ).rejects.toThrow('aborted');
  });
});
