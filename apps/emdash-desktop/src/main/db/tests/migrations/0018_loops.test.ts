import { openFixture } from '@tooling/utils/db';
import { afterEach, describe, expect, it } from 'vitest';

describe('0018 loops migration', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  afterEach(() => {
    fixture?.close();
  });

  it('creates the loops and loop_phases tables', async () => {
    fixture = await openFixture('empty');

    const tables = fixture.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('loops');
    expect(tableNames).toContain('loop_phases');
  });

  it('gives loops the expected columns', async () => {
    fixture = await openFixture('empty');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(loops)`).all() as {
      name: string;
    }[];
    const names = columns.map((c) => c.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'task_id',
        'status',
        'current_phase_index',
        'config',
        'created_at',
        'updated_at',
      ])
    );
  });

  it('gives loop_phases the expected columns', async () => {
    fixture = await openFixture('empty');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(loop_phases)`).all() as {
      name: string;
    }[];
    const names = columns.map((c) => c.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'loop_id',
        'order_index',
        'name',
        'goal',
        'checks',
        'status',
        'attempts',
      ])
    );
  });
});
