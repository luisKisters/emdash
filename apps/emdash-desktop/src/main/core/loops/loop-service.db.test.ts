import { openFixture } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '@main/db/client';
import type { IExecutionContext } from '@main/core/execution-context/types';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import { LoopService } from './loop-service';
import {
  createLoop,
  getLoop,
  getLoopByTask,
  listLoops,
  updateLoop,
  updatePhase,
} from './operations/loop-operations';

const mocks = vi.hoisted(() => ({
  db: undefined as AppDb | undefined,
}));

vi.mock('@main/db/client', () => ({
  get db() {
    if (!mocks.db) throw new Error('Test database not initialized');
    return mocks.db;
  },
}));

const config: LoopConfig = { version: '1', provider: 'claude', model: '' };

function makeService(): LoopService {
  return new LoopService({
    ops: { createLoop, getLoop, getLoopByTask, listLoops, updateLoop, updatePhase },
    driverFor: () => ({ runTurn: async () => ({ finalText: '' }) }),
    getVerifier: () => undefined,
    getMaxAttempts: async () => 3,
    resolveVerifierContext: async () => ({
      ctx: { dispose() {} } as unknown as IExecutionContext,
      cwd: '/tmp/ws',
    }),
  });
}

describe('LoopService crash-resume (db)', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  beforeEach(async () => {
    fixture = await openFixture('empty');
    mocks.db = fixture.db;

    fixture.sqlite
      .prepare(
        `INSERT INTO projects (id, name, path, created_at, updated_at)
         VALUES ('project-1', 'Project', '/repo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run();
    fixture.sqlite
      .prepare(
        `INSERT INTO tasks (id, project_id, name, status, created_at, updated_at, status_changed_at)
         VALUES ('task-1', 'project-1', 'Task', 'in_progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run();
  });

  afterEach(() => {
    fixture.close();
    mocks.db = undefined;
  });

  it('moves a running loop to paused on boot', async () => {
    const created = await createLoop({
      taskId: 'task-1',
      config,
      phases: [{ name: 'Build', goal: 'build it', checks: ['unit-tests'] }],
    });
    await updateLoop(created.id, { status: 'running' });

    await makeService().pauseRunningLoopsForBoot();

    const reread = await getLoop(created.id);
    expect(reread?.status).toBe('paused');
  });
});
