import type { NavigateFnTyped } from '@renderer/lib/layout/navigation-provider';
import type { CreateTaskDraft } from './create-task-draft';

export function continueToLoopVerification(
  draft: CreateTaskDraft,
  closeModal: () => void,
  navigate: NavigateFnTyped
): void {
  closeModal();
  navigate('loopVerification', { projectId: draft.projectId, draft });
}

export function returnToCreateTask(
  draft: CreateTaskDraft,
  navigate: NavigateFnTyped,
  showCreateTaskModal: (args: { draft: CreateTaskDraft }) => void
): void {
  navigate('project', { projectId: draft.projectId });
  showCreateTaskModal({ draft });
}
