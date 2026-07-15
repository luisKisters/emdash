import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { loopPhases, loops, type LoopPhaseRow, type LoopRow } from '@main/db/schema';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import type {
  Loop,
  LoopPhase,
  LoopStatus,
  PhaseStatus,
  VerifierId,
} from '@shared/core/loops/loops';

const VERIFIER_IDS: readonly VerifierId[] = ['unit-tests', 'github', 'browser'];

function parseChecks(raw: string): VerifierId[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is VerifierId => VERIFIER_IDS.includes(v as VerifierId));
  } catch {
    return [];
  }
}

function mapPhaseRow(row: LoopPhaseRow): LoopPhase {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    checks: parseChecks(row.checks),
    status: row.status as PhaseStatus,
    attempts: row.attempts,
  };
}

function mapLoopRow(row: LoopRow, phaseRows: LoopPhaseRow[]): Loop {
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status as LoopStatus,
    currentPhaseIndex: row.currentPhaseIndex,
    phases: phaseRows.map(mapPhaseRow),
    // config column is nullable; fall back to a default so the domain type stays non-null.
    config: row.config ?? { version: '1', provider: 'claude', model: '' },
  };
}

async function loadPhases(loopId: string): Promise<LoopPhaseRow[]> {
  return db
    .select()
    .from(loopPhases)
    .where(eq(loopPhases.loopId, loopId))
    .orderBy(asc(loopPhases.orderIndex));
}

export type CreateLoopInput = {
  taskId: string;
  config: LoopConfig;
  phases: Array<{ name: string; goal: string; checks: VerifierId[] }>;
};

export async function createLoop(input: CreateLoopInput): Promise<Loop> {
  const loopId = randomUUID();
  const [loopRow] = await db
    .insert(loops)
    .values({
      id: loopId,
      taskId: input.taskId,
      status: 'draft',
      currentPhaseIndex: 0,
      config: input.config,
    })
    .returning();

  const phaseRows: LoopPhaseRow[] =
    input.phases.length > 0
      ? await db
          .insert(loopPhases)
          .values(
            input.phases.map((phase, index) => ({
              id: randomUUID(),
              loopId,
              orderIndex: index,
              name: phase.name,
              goal: phase.goal,
              checks: JSON.stringify(phase.checks),
              status: 'pending',
              attempts: 0,
            }))
          )
          .returning()
      : [];

  phaseRows.sort((a, b) => a.orderIndex - b.orderIndex);
  return mapLoopRow(loopRow, phaseRows);
}

export async function getLoop(id: string): Promise<Loop | null> {
  const [row] = await db.select().from(loops).where(eq(loops.id, id)).limit(1);
  if (!row) return null;
  return mapLoopRow(row, await loadPhases(row.id));
}

export async function getLoopByTask(taskId: string): Promise<Loop | null> {
  const [row] = await db
    .select()
    .from(loops)
    .where(eq(loops.taskId, taskId))
    .orderBy(desc(loops.createdAt))
    .limit(1);
  if (!row) return null;
  return mapLoopRow(row, await loadPhases(row.id));
}

export async function listLoops(): Promise<Loop[]> {
  const rows = await db.select().from(loops).orderBy(desc(loops.createdAt));
  const result: Loop[] = [];
  for (const row of rows) {
    result.push(mapLoopRow(row, await loadPhases(row.id)));
  }
  return result;
}

export async function updateLoop(
  id: string,
  patch: Partial<Pick<Loop, 'status' | 'currentPhaseIndex' | 'config'>>
): Promise<Loop | null> {
  const values: Partial<typeof loops.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.currentPhaseIndex !== undefined) values.currentPhaseIndex = patch.currentPhaseIndex;
  if (patch.config !== undefined) values.config = patch.config;

  const [row] = await db.update(loops).set(values).where(eq(loops.id, id)).returning();
  if (!row) return null;
  return mapLoopRow(row, await loadPhases(row.id));
}

export async function updatePhase(
  phaseId: string,
  patch: Partial<Pick<LoopPhase, 'status' | 'attempts'>>
): Promise<LoopPhase | null> {
  const values: Partial<typeof loopPhases.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.attempts !== undefined) values.attempts = patch.attempts;

  const [row] = await db
    .update(loopPhases)
    .set(values)
    .where(eq(loopPhases.id, phaseId))
    .returning();
  return row ? mapPhaseRow(row) : null;
}
