import { makeAutoObservable } from 'mobx';
import type { CreateLoopInput } from '@main/core/loops/operations/loop-operations';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import type { VerifierId } from '@shared/core/loops/loops';

/** `unit-tests` is always on and cannot be toggled off. */
export const FIXED_CHECK: VerifierId = 'unit-tests';
export const OPTIONAL_CHECKS: readonly VerifierId[] = ['github', 'browser'];

export type PhaseDraft = {
  id: string;
  name: string;
  goal: string;
  /** Always contains FIXED_CHECK; optional checks are appended. */
  checks: VerifierId[];
};

function newPhase(): PhaseDraft {
  return { id: crypto.randomUUID(), name: '', goal: '', checks: [FIXED_CHECK] };
}

/**
 * Local editor state for the create-loop form: an ordered list of phase drafts
 * plus the chosen provider/model. Pure logic so it is unit-testable in `node`.
 */
export class CreateLoopFormModel {
  phases: PhaseDraft[] = [newPhase()];
  provider = 'claude';
  model = '';

  constructor() {
    makeAutoObservable(this);
  }

  addPhase(): void {
    this.phases.push(newPhase());
  }

  removePhase(id: string): void {
    if (this.phases.length <= 1) return;
    this.phases = this.phases.filter((p) => p.id !== id);
  }

  movePhase(id: string, direction: -1 | 1): void {
    const index = this.phases.findIndex((p) => p.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= this.phases.length) return;
    const next = [...this.phases];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    this.phases = next;
  }

  setName(id: string, name: string): void {
    const phase = this.phases.find((p) => p.id === id);
    if (phase) phase.name = name;
  }

  setGoal(id: string, goal: string): void {
    const phase = this.phases.find((p) => p.id === id);
    if (phase) phase.goal = goal;
  }

  hasCheck(id: string, check: VerifierId): boolean {
    return this.phases.find((p) => p.id === id)?.checks.includes(check) ?? false;
  }

  toggleCheck(id: string, check: VerifierId): void {
    // The fixed check can never be removed or duplicated.
    if (check === FIXED_CHECK) return;
    const phase = this.phases.find((p) => p.id === id);
    if (!phase) return;
    if (phase.checks.includes(check)) {
      phase.checks = phase.checks.filter((c) => c !== check);
    } else {
      phase.checks = [...phase.checks, check];
    }
  }

  get canSubmit(): boolean {
    return this.phases.length > 0 && this.phases.every((p) => p.name.trim() && p.goal.trim());
  }

  toCreateInput(taskId: string): { taskId: string; phases: CreateLoopInput['phases']; config: LoopConfig } {
    const config: LoopConfig = { version: '1', provider: this.provider, model: this.model };
    return {
      taskId,
      config,
      phases: this.phases.map((p) => ({
        name: p.name.trim(),
        goal: p.goal.trim(),
        checks: p.checks,
      })),
    };
  }
}
