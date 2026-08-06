import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewLoopConfigV2 } from '@shared/core/loops/loops';

let cleanup: { sqlite: BetterSqlite3.Database; root: string } | undefined;

afterEach(async () => {
  cleanup?.sqlite.close();
  if (cleanup) await rm(cleanup.root, { recursive: true, force: true });
  cleanup = undefined;
  delete process.env.EMDASH_DB_FILE;
  vi.resetModules();
});

describe('replaceLoopPhases', () => {
  it('atomically replaces phases, resolved verifier config, criteria, and status', async () => {
    const loaded = await loadOperation();
    cleanup = loaded;

    const result = await loaded.replaceLoopPhases('loop-1', replacement());

    expect(result).toMatchObject({
      success: true,
      data: {
        status: 'draft',
        config: {
          validationCommands: ['pnpm test'],
          verifierPlan: [{ kind: 'custom', name: 'Focused tests', command: 'pnpm test' }],
        },
        phases: [
          { idx: 0, kind: 'work', name: 'Implement' },
          { idx: 1, kind: 'review', name: 'Review' },
          { idx: 2, kind: 'e2e', name: 'E2E' },
        ],
      },
    });
    const row = loaded.sqlite
      .prepare('SELECT status, config FROM loops WHERE id = ?')
      .get('loop-1') as { status: string; config: string };
    expect(row.status).toBe('draft');
    expect(JSON.parse(row.config)).toMatchObject({ validationCommands: ['pnpm test'] });
    expect(
      loaded.sqlite
        .prepare('SELECT COUNT(*) AS count FROM loop_phases WHERE loop_id = ?')
        .get('loop-1')
    ).toEqual({ count: 3 });
  });

  it('rolls back without partial state when any replacement phase insert fails', async () => {
    const loaded = await loadOperation();
    cleanup = loaded;

    const result = await loaded.replaceLoopPhases('loop-1', {
      ...replacement(),
      phases: [{ name: 'Break', goal: 'Trigger the test constraint.' }],
    });

    expect(result).toMatchObject({ success: false, error: { kind: 'db-error' } });
    expect(
      loaded.sqlite.prepare('SELECT status, config FROM loops WHERE id = ?').get('loop-1')
    ).toEqual({ status: 'preparing', config: JSON.stringify(initialConfig()) });
    expect(
      loaded.sqlite.prepare('SELECT id, name FROM loop_phases WHERE loop_id = ?').all('loop-1')
    ).toEqual([{ id: 'old-phase', name: 'Old phase' }]);
  });
});

function initialConfig(): NewLoopConfigV2 {
  return {
    version: '2',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    validationCommands: [],
    planSource: 'Plan the work.',
    terminalGates: { review: true, e2e: true },
    browserPreview: { enabled: true },
    reviewEnabled: true,
    verifiers: [],
    verifierPlan: [{ kind: 'custom', name: 'Focused tests', command: null }],
  };
}

function replacement() {
  return {
    phases: [{ name: 'Implement', goal: 'Implement the feature.' }],
    config: {
      ...initialConfig(),
      validationCommands: ['pnpm test'],
      verifierPlan: [{ kind: 'custom' as const, name: 'Focused tests', command: 'pnpm test' }],
    },
    acceptanceCriteria: ['The feature works.'],
  };
}

async function loadOperation() {
  vi.resetModules();
  const root = await mkdtemp(join(tmpdir(), 'emdash-replace-loop-phases-'));
  process.env.EMDASH_DB_FILE = join(root, 'test.db');
  const [{ sqlite }, { replaceLoopPhases }] = await Promise.all([
    import('@main/db/client'),
    import('./replace-loop-phases'),
  ]);
  sqlite.exec(`
    CREATE TABLE loops (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      status TEXT NOT NULL,
      current_phase_index INTEGER NOT NULL DEFAULT 0,
      config TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      state TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE loop_phases (
      id TEXT PRIMARY KEY,
      loop_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      name TEXT NOT NULL CHECK (name <> 'Break'),
      goal TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'work',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT,
      criteria TEXT,
      state TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const state = {
    version: '2',
    baseCommit: null,
    expectedFeatureHead: null,
    checkpointCommit: null,
    e2eAttemptsConsumed: 0,
    sessionAttempts: [],
    verification: null,
    preparationConversationId: 'planning-conversation',
    preparationGoal: 'Ship the feature.',
  };
  sqlite
    .prepare(
      `INSERT INTO loops
       (id, project_id, task_id, name, slug, status, config, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'loop-1',
      'project-1',
      'task-1',
      'Loop',
      'loop',
      'preparing',
      JSON.stringify(initialConfig()),
      JSON.stringify(state)
    );
  sqlite
    .prepare(
      `INSERT INTO loop_phases (id, loop_id, idx, name, goal)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run('old-phase', 'loop-1', 0, 'Old phase', 'Old goal');
  return { replaceLoopPhases, sqlite, root };
}
