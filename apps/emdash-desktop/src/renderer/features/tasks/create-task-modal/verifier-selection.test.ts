import { describe, expect, it } from 'vitest';
import { createDefaultLoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import type { DetectedVerifier, SelectedVerifier } from '@shared/core/loops/verifier-catalog';
import { applyVerifierPlan, selectDetectedVerifier } from './verifier-selection';

const detected: DetectedVerifier = {
  id: 'workspace-test',
  class: 'unit-test',
  label: 'Workspace tests',
  command: 'node test.js',
  source: 'package.json',
};

describe('verifier selection', () => {
  it('persists the exact shared detected shape without detector-only fields', () => {
    expect(selectDetectedVerifier(detected)).toEqual({
      kind: 'detected',
      id: 'workspace-test',
      class: 'unit-test',
      label: 'Workspace tests',
      command: 'node test.js',
    });
  });

  it.each<{
    name: string;
    selection: SelectedVerifier[];
    commands: string[];
    e2e: boolean;
  }>([
    {
      name: 'command-running detected entry',
      selection: [selectDetectedVerifier(detected)],
      commands: ['node test.js'],
      e2e: false,
    },
    {
      name: 'browser entry',
      selection: [
        {
          kind: 'detected',
          id: 'agent-browser',
          class: 'browser',
          label: 'Codex computer use',
          command: 'agent-browser',
        },
      ],
      commands: [],
      e2e: true,
    },
    {
      name: 'name-only custom entry',
      selection: [{ kind: 'custom', name: 'Manual review', command: null }],
      commands: [],
      e2e: false,
    },
  ])('maps $name', ({ selection, commands, e2e }) => {
    const result = applyVerifierPlan(createDefaultLoopPlanDraft(), selection);
    expect(result.verifierPlan).toEqual(selection);
    expect(result.validationCommands).toEqual(commands);
    expect(result.terminalGates.e2e).toBe(e2e);
  });
});
