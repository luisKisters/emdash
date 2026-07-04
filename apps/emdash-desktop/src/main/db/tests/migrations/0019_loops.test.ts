import { openFixture } from '@tooling/utils/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { loopPhases, loops } from '@main/db/schema';

describe('0019 loops migration', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  afterEach(() => {
    fixture?.close();
  });

  it('adds loops and loop_phases tables', async () => {
    fixture = await openFixture('pre-0019');

    const tables = fixture.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('loops');
    expect(tableNames).toContain('loop_phases');
  });

  it('adds expected loop columns and defaults', async () => {
    fixture = await openFixture('pre-0019');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(loops)`).all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    expect(columns.find((c) => c.name === 'project_id')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'task_id')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'status')?.dflt_value).toBe("'draft'");
    expect(columns.find((c) => c.name === 'current_phase_index')?.dflt_value).toBe('0');
    expect(columns.find((c) => c.name === 'config')?.notnull).toBe(0);
  });

  it('adds expected loop phase columns, defaults, foreign keys, and loop_id index', async () => {
    fixture = await openFixture('pre-0019');

    const columns = fixture.sqlite.prepare(`PRAGMA table_info(loop_phases)`).all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];

    expect(columns.find((c) => c.name === 'loop_id')?.notnull).toBe(1);
    expect(columns.find((c) => c.name === 'status')?.dflt_value).toBe("'pending'");
    expect(columns.find((c) => c.name === 'attempts')?.dflt_value).toBe('0');
    expect(columns.find((c) => c.name === 'criteria')?.notnull).toBe(0);

    const foreignKeys = fixture.sqlite.prepare(`PRAGMA foreign_key_list(loop_phases)`).all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'loops',
          from: 'loop_id',
          to: 'id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'conversations',
          from: 'conversation_id',
          to: 'id',
          on_delete: 'SET NULL',
        }),
      ])
    );

    const indexes = fixture.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='loop_phases'`)
      .all() as { name: string }[];

    expect(indexes.map((i) => i.name)).toContain('idx_loop_phases_loop_id');
  });

  it('persists typed versioned JSON config and criteria', async () => {
    fixture = await openFixture('pre-0019');

    await fixture.db.insert(loops).values({
      id: 'loop-0018',
      projectId: '11111111-1111-1111-1111-111111111111',
      taskId: 'aaaa0001-0000-0000-0000-000000000000',
      name: 'ACP loops',
      slug: 'acp-loops',
      config: {
        version: '1',
        verifiers: ['gh', 'agent-browser'],
        reviewEnabled: true,
        validationCommands: ['pnpm run test'],
        planSource: 'docs/plans/acp-loops.md',
      },
    });

    await fixture.db.insert(loopPhases).values({
      id: 'loop-phase-0018',
      loopId: 'loop-0018',
      idx: 0,
      name: 'Schema',
      goal: 'Add loop schema',
      conversationId: 'cccc0001-0000-0000-0000-000000000000',
      criteria: {
        version: '1',
        criteria: [
          {
            description: 'CI is green',
            verifier: 'gh',
            status: 'pending',
          },
        ],
      },
    });

    const [loop] = await fixture.db.select().from(loops).where(eq(loops.id, 'loop-0018'));
    const [phase] = await fixture.db
      .select()
      .from(loopPhases)
      .where(eq(loopPhases.id, 'loop-phase-0018'));

    expect(loop?.status).toBe('draft');
    expect(loop?.currentPhaseIndex).toBe(0);
    expect(loop?.config).toMatchObject({
      version: '1',
      verifiers: ['gh', 'agent-browser'],
      reviewEnabled: true,
    });
    expect(phase?.status).toBe('pending');
    expect(phase?.attempts).toBe(0);
    expect(phase?.criteria?.criteria[0]).toMatchObject({
      description: 'CI is green',
      verifier: 'gh',
      status: 'pending',
    });
  });
});
