import { openFixture } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '@main/db/client';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import {
  createLoop,
  getLoop,
  getLoopByTask,
  listLoops,
  updateLoop,
  updatePhase,
} from './loop-operations';

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

describe('loop-operations', () => {
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

  it('round-trips a loop with phases through create, read, and update', async () => {
    const created = await createLoop({
      taskId: 'task-1',
      config,
      phases: [
        { name: 'Build', goal: 'make it build', checks: ['unit-tests'] },
        { name: 'Verify', goal: 'run the checks', checks: ['unit-tests', 'github'] },
      ],
    });

    expect(created.status).toBe('draft');
    expect(created.currentPhaseIndex).toBe(0);
    expect(created.phases).toHaveLength(2);
    expect(created.phases[0]!.name).toBe('Build');
    expect(created.phases[0]!.checks).toEqual(['unit-tests']);
    expect(created.phases[1]!.checks).toEqual(['unit-tests', 'github']);
    expect(created.config).toEqual(config);

    const fetched = await getLoop(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.phases.map((p) => p.name)).toEqual(['Build', 'Verify']);

    const byTask = await getLoopByTask('task-1');
    expect(byTask?.id).toBe(created.id);

    const updated = await updateLoop(created.id, { status: 'running', currentPhaseIndex: 1 });
    expect(updated?.status).toBe('running');
    expect(updated?.currentPhaseIndex).toBe(1);

    const phaseId = created.phases[0]!.id;
    const updatedPhase = await updatePhase(phaseId, { status: 'passed', attempts: 2 });
    expect(updatedPhase?.status).toBe('passed');
    expect(updatedPhase?.attempts).toBe(2);

    const reread = await getLoop(created.id);
    expect(reread!.phases[0]!.status).toBe('passed');
    expect(reread!.phases[0]!.attempts).toBe(2);

    const all = await listLoops();
    expect(all).toHaveLength(1);
  });

  it('returns null for a missing loop', async () => {
    expect(await getLoop('nope')).toBeNull();
    expect(await getLoopByTask('nope')).toBeNull();
  });
});
