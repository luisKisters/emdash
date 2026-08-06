import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@main/db/client';
import { loopPhases, loops } from '@main/db/schema';
import { err, ok, type Result } from '@main/lib/result';
import type { LoopPhaseState } from '@shared/core/loops/loop-phase-state';
import {
  type LoopPhaseCriteria,
  type LoopWithPhases,
  type NewLoopConfigV2,
  newLoopConfigV2Schema,
  orderedLoopPhaseKinds,
} from '@shared/core/loops/loops';
import { mapLoopPhaseRow, mapLoopRow, type LoopOperationError } from './types';

export type ReplacementLoopPhase = { name: string; goal: string };

export type ReplaceLoopPhasesInput = {
  phases: readonly ReplacementLoopPhase[];
  config: NewLoopConfigV2;
  acceptanceCriteria: readonly string[];
};

function initialPhaseState(): LoopPhaseState {
  return {
    version: '2',
    checkpointCommit: null,
    handoff: null,
    retryHandoffs: [],
    result: null,
  };
}

export async function replaceLoopPhases(
  loopId: string,
  input: ReplaceLoopPhasesInput
): Promise<Result<LoopWithPhases, LoopOperationError>> {
  const config = newLoopConfigV2Schema.strict().safeParse(input.config);
  const phases = input.phases.map((phase, index) => ({
    name: phase.name.trim() || `Phase ${index + 1}`,
    goal: phase.goal.trim(),
  }));
  const acceptanceCriteria = input.acceptanceCriteria
    .map((criterion) => criterion.trim())
    .filter(Boolean);
  if (
    !config.success ||
    phases.length === 0 ||
    phases.some((phase) => !phase.goal) ||
    (config.success && config.data.terminalGates.e2e && acceptanceCriteria.length === 0)
  ) {
    return err({ kind: 'invalid-input', message: 'Resolved Loop plan is incomplete' });
  }

  try {
    const committed = db.transaction((tx): Result<LoopWithPhases, LoopOperationError> => {
      const [existing] = tx.select().from(loops).where(eq(loops.id, loopId)).limit(1).all();
      if (!existing) return err({ kind: 'not-found', message: 'Loop not found' });
      if (existing.status !== 'preparing' || existing.state?.version !== '2') {
        return err({ kind: 'conflict', message: 'Loop preparation changed concurrently' });
      }

      tx.delete(loopPhases).where(eq(loopPhases.loopId, loopId)).run();
      const phaseRows = orderedLoopPhaseKinds(phases.length, config.data.terminalGates).map(
        (kind, idx) => {
          const workPhase = kind === 'work' ? phases[idx] : undefined;
          const criteria: LoopPhaseCriteria = {
            version: '1',
            criteria:
              kind === 'e2e'
                ? acceptanceCriteria.map((description) => ({
                    description,
                    verifier: 'agent-browser',
                    status: 'pending',
                  }))
                : [],
          };
          const [row] = tx
            .insert(loopPhases)
            .values({
              id: randomUUID(),
              loopId,
              idx,
              kind,
              name: workPhase?.name ?? (kind === 'review' ? 'Review' : 'E2E'),
              goal:
                workPhase?.goal ??
                (kind === 'review'
                  ? 'Review the complete implementation and resolve all blocking findings.'
                  : 'Recreate and verify the feature in a clean-room workspace.'),
              status: 'pending',
              attempts: 0,
              criteria,
              state: initialPhaseState(),
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .returning()
            .all();
          return row;
        }
      );

      const [loopRow] = tx
        .update(loops)
        .set({
          status: 'draft',
          currentPhaseIndex: 0,
          config: config.data,
          state: { ...existing.state, preparationError: undefined },
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(loops.id, loopId))
        .returning()
        .all();
      return ok({
        ...mapLoopRow(loopRow),
        phases: phaseRows.map(mapLoopPhaseRow),
      });
    });
    return committed;
  } catch (error) {
    return err({
      kind: 'db-error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
