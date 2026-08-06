import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

let cleanup: { sqlite: BetterSqlite3.Database; root: string } | undefined;

afterEach(async () => {
  cleanup?.sqlite.close();
  if (cleanup) await rm(cleanup.root, { recursive: true, force: true });
  cleanup = undefined;
  delete process.env.EMDASH_DB_FILE;
  vi.resetModules();
});

describe('planning lifecycle persistence', () => {
  it('reuses the planning conversation and rejects a concurrent retry claim', async () => {
    const loaded = await loadOperations('prepare-failed');
    cleanup = loaded;

    const [first, second] = await Promise.all([
      loaded.beginLoopPreparationRetry('loop-1'),
      loaded.beginLoopPreparationRetry('loop-1'),
    ]);

    expect(first.success).not.toBe(second.success);
    const accepted = first.success ? first : second;
    expect(accepted).toMatchObject({
      success: true,
      data: {
        status: 'preparing',
        state: { preparationConversationId: 'planning-conversation' },
      },
    });
    const rejected = first.success ? second : first;
    expect(rejected).toMatchObject({ success: false, error: { kind: 'conflict' } });
  });

  it('settles boot-interrupted preparation and its active attempt to durable errors', async () => {
    const loaded = await loadOperations('preparing', true);
    cleanup = loaded;

    const settled = await loaded.settlePreparingLoopsForBoot();

    expect(settled).toMatchObject([
      {
        status: 'prepare-failed',
        state: {
          preparationConversationId: 'planning-conversation',
          preparationError: 'Loop planning was interrupted by application restart',
          sessionAttempts: [
            {
              purpose: 'planning',
              status: 'interrupted',
              error: 'Loop planning was interrupted by application restart',
            },
          ],
        },
      },
    ]);
  });
});

async function loadOperations(status: 'preparing' | 'prepare-failed', activeAttempt = false) {
  vi.resetModules();
  const root = await mkdtemp(join(tmpdir(), 'emdash-planning-lifecycle-'));
  process.env.EMDASH_DB_FILE = join(root, 'test.db');
  const [{ sqlite }, operations] = await Promise.all([
    import('@main/db/client'),
    import('./loop-operations'),
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
      name TEXT NOT NULL,
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
  const target = { workspaceId: 'workspace-1', path: '/tmp/task', machine: { kind: 'local' } };
  const state = {
    version: '2',
    baseCommit: null,
    expectedFeatureHead: null,
    checkpointCommit: null,
    e2eAttemptsConsumed: 0,
    sessionAttempts: activeAttempt
      ? [
          {
            attemptId: 'planning-attempt-1',
            conversationId: 'planning-conversation',
            purpose: 'planning',
            target,
            status: 'running',
            startedAt: '2026-08-06T10:00:00.000Z',
          },
        ]
      : [],
    verification: null,
    preparationConversationId: 'planning-conversation',
    preparationGoal: 'Ship the feature.',
    ...(status === 'prepare-failed' ? { preparationError: 'First attempt failed' } : {}),
  };
  const config = {
    version: '2',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    validationCommands: [],
    planSource: 'Plan the work.',
    terminalGates: { review: false, e2e: false },
    browserPreview: { enabled: false },
    reviewEnabled: false,
    verifiers: [],
    verifierPlan: [],
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
      status,
      JSON.stringify(config),
      JSON.stringify(state)
    );
  return {
    beginLoopPreparationRetry: operations.beginLoopPreparationRetry,
    settlePreparingLoopsForBoot: operations.settlePreparingLoopsForBoot,
    sqlite,
    root,
  };
}
