import { describe, expect, it } from 'vitest';
import { CreateLoopFormModel } from './create-loop-form-model';

describe('CreateLoopFormModel', () => {
  it('starts with one phase carrying the fixed unit-tests check', () => {
    const model = new CreateLoopFormModel();
    expect(model.phases).toHaveLength(1);
    expect(model.phases[0].checks).toEqual(['unit-tests']);
  });

  it('adds and removes phases but keeps at least one', () => {
    const model = new CreateLoopFormModel();
    model.addPhase();
    model.addPhase();
    expect(model.phases).toHaveLength(3);

    const middleId = model.phases[1].id;
    model.removePhase(middleId);
    expect(model.phases.map((p) => p.id)).not.toContain(middleId);
    expect(model.phases).toHaveLength(2);

    model.removePhase(model.phases[0].id);
    model.removePhase(model.phases[0].id);
    expect(model.phases).toHaveLength(1);
  });

  it('reorders phases', () => {
    const model = new CreateLoopFormModel();
    model.addPhase();
    model.addPhase();
    const [a, b, c] = model.phases.map((p) => p.id);

    model.movePhase(c, -1);
    expect(model.phases.map((p) => p.id)).toEqual([a, c, b]);

    model.movePhase(a, 1);
    expect(model.phases.map((p) => p.id)).toEqual([c, a, b]);

    // No-ops at the boundaries.
    model.movePhase(c, -1);
    expect(model.phases.map((p) => p.id)).toEqual([c, a, b]);
  });

  it('cannot remove or toggle off the unit-tests check', () => {
    const model = new CreateLoopFormModel();
    const id = model.phases[0].id;
    model.toggleCheck(id, 'unit-tests');
    expect(model.hasCheck(id, 'unit-tests')).toBe(true);
  });

  it('toggles github and browser checks into and out of a phase', () => {
    const model = new CreateLoopFormModel();
    const id = model.phases[0].id;

    model.toggleCheck(id, 'github');
    expect(model.hasCheck(id, 'github')).toBe(true);
    model.toggleCheck(id, 'browser');
    expect(model.phases[0].checks).toEqual(['unit-tests', 'github', 'browser']);

    model.toggleCheck(id, 'github');
    expect(model.hasCheck(id, 'github')).toBe(false);
    expect(model.phases[0].checks).toEqual(['unit-tests', 'browser']);
  });

  it('builds a create input with trimmed names/goals and config', () => {
    const model = new CreateLoopFormModel();
    const id = model.phases[0].id;
    model.setName(id, '  Build  ');
    model.setGoal(id, '  do the thing  ');
    model.model = 'sonnet';

    expect(model.canSubmit).toBe(true);
    const input = model.toCreateInput('task-1');
    expect(input.taskId).toBe('task-1');
    expect(input.config).toEqual({ version: '1', provider: 'claude', model: 'sonnet' });
    expect(input.phases).toEqual([
      { name: 'Build', goal: 'do the thing', checks: ['unit-tests'] },
    ]);
  });

  it('canSubmit is false until every phase has a name and goal', () => {
    const model = new CreateLoopFormModel();
    expect(model.canSubmit).toBe(false);
    const id = model.phases[0].id;
    model.setName(id, 'Build');
    expect(model.canSubmit).toBe(false);
    model.setGoal(id, 'goal');
    expect(model.canSubmit).toBe(true);
  });
});
