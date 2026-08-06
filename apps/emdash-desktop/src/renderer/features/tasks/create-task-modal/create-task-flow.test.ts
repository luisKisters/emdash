import { describe, expect, it, vi } from 'vitest';
import { createDefaultLoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import type { CreateTaskDraft } from './create-task-draft';
import { continueToLoopVerification, returnToCreateTask } from './create-task-flow';

function draft(): CreateTaskDraft {
  return {
    projectId: 'project-1',
    linkedType: 'plan',
    linkedIssue: null,
    linkedPR: null,
    taskName: 'keep-this-name',
    selectedPlanPath: 'plans/feature.md',
    verifierSelectionInitialized: false,
    loopPlan: { ...createDefaultLoopPlanDraft(), enabled: true, planSource: '# Plan' },
    workspace: {},
    conversation: {
      provider: 'codex',
      model: 'gpt-5',
      prompt: '',
      autoApprove: true,
      useChatUi: true,
    },
  };
}

describe('create task plan flow', () => {
  it('closes the modal, opens Verification, and restores the same draft on Back', () => {
    const value = draft();
    const close = vi.fn();
    const navigate = vi.fn();
    const showCreateTask = vi.fn();

    continueToLoopVerification(value, close, navigate);
    expect(close).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenLastCalledWith('loopVerification', {
      projectId: 'project-1',
      draft: value,
    });

    returnToCreateTask(value, navigate, showCreateTask);
    expect(navigate).toHaveBeenLastCalledWith('project', { projectId: 'project-1' });
    expect(showCreateTask).toHaveBeenCalledWith({ draft: value });
  });
});
