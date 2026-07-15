import { describe, expect, it } from 'vitest';
import type { LoopPhase } from '@shared/core/loops/loops';
import { buildPhasePrompt, buildRetryPrompt, parsePhaseOutcome } from './prompt-builder';

function phase(overrides: Partial<LoopPhase> = {}): LoopPhase {
  return {
    id: 'p1',
    name: 'Implement feature',
    goal: 'Add the widget',
    checks: ['unit-tests'],
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

describe('parsePhaseOutcome', () => {
  it('recognizes the done sentinel', () => {
    expect(parsePhaseOutcome('all good <<<LOOP:PHASE_DONE>>>')).toBe('done');
  });

  it('recognizes the failed sentinel', () => {
    expect(parsePhaseOutcome('stuck <<<LOOP:PHASE_FAILED>>>')).toBe('failed');
  });

  it('returns unknown when no sentinel is present', () => {
    expect(parsePhaseOutcome('I did some work but forgot the sentinel')).toBe('unknown');
  });
});

describe('buildPhasePrompt', () => {
  it('includes the phase name, goal, and sentinel instructions', () => {
    const prompt = buildPhasePrompt(phase());
    expect(prompt).toContain('Implement feature');
    expect(prompt).toContain('Add the widget');
    expect(prompt).toContain('<<<LOOP:PHASE_DONE>>>');
    expect(prompt).toContain('<<<LOOP:PHASE_FAILED>>>');
  });

  it('includes the prior summary when provided', () => {
    const prompt = buildPhasePrompt(phase(), { priorSummary: 'previous phase passed' });
    expect(prompt).toContain('previous phase passed');
  });

  it('includes github facts when provided', () => {
    const prompt = buildPhasePrompt(phase(), {
      github: {
        nameWithOwner: 'acme/widgets',
        host: 'github.com',
        branch: 'feature/x',
        prNumber: 42,
        prUrl: 'https://github.com/acme/widgets/pull/42',
      },
    });
    expect(prompt).toContain('acme/widgets');
    expect(prompt).toContain('feature/x');
    expect(prompt).toContain('#42');
  });

  it('omits the github section when no facts are provided', () => {
    const prompt = buildPhasePrompt(phase());
    expect(prompt).not.toContain('GitHub context');
  });
});

describe('buildRetryPrompt', () => {
  it('includes the prior failure details and sentinel instructions', () => {
    const prompt = buildRetryPrompt(phase(), 'unit tests failed: 2 assertions');
    expect(prompt).toContain('unit tests failed: 2 assertions');
    expect(prompt).toContain('<<<LOOP:PHASE_DONE>>>');
  });
});
