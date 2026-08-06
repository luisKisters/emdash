import type { AgentProviderId } from '@emdash/plugins/agents';
import type { LoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import type { LinkedIssue } from '@shared/core/linked-issue';
import type { PullRequest } from '@shared/core/pull-requests/pull-requests';
import type { InitialConversationState } from '../task-config/initial-conversation-section';
import type { LinkedType } from './use-create-task-state';
import type { CreateTaskState } from './use-create-task-state';
import type { WorkspaceConfigInitial } from './use-workspace-config';

export type CreateTaskDraft = {
  projectId: string;
  linkedType: LinkedType;
  linkedIssue: LinkedIssue | null;
  linkedPR: PullRequest | null;
  taskName: string;
  selectedPlanPath: string | null;
  verifierSelectionInitialized: boolean;
  loopPlan: LoopPlanDraft;
  workspace: WorkspaceConfigInitial;
  conversation: {
    provider: AgentProviderId | null;
    model: string | null;
    prompt: string;
    autoApprove: boolean;
    useChatUi: boolean;
  };
};

export function isCreateTaskDraft(value: unknown): value is CreateTaskDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<CreateTaskDraft>;
  if (typeof draft.projectId !== 'string' || !draft.projectId.trim()) return false;
  if (typeof draft.taskName !== 'string') return false;
  if (!['issue', 'pr', 'plan', null].includes(draft.linkedType ?? null)) return false;
  if (typeof draft.loopPlan !== 'object' || draft.loopPlan === null) return false;
  if (typeof draft.loopPlan.planSource !== 'string') return false;
  if (!Array.isArray(draft.loopPlan.verifierPlan)) return false;
  if (typeof draft.workspace !== 'object' || draft.workspace === null) return false;
  if (typeof draft.conversation !== 'object' || draft.conversation === null) return false;
  return true;
}

export function snapshotCreateTaskDraft(
  projectId: string,
  state: CreateTaskState,
  conversation: InitialConversationState,
  verifierSelectionInitialized = false
): CreateTaskDraft {
  return {
    projectId,
    linkedType: state.linkedType,
    linkedIssue: state.linkedIssue,
    linkedPR: state.linkedPR,
    taskName: state.taskName.taskName || state.taskName.effectiveTaskName,
    selectedPlanPath: state.selectedPlanPath,
    verifierSelectionInitialized,
    loopPlan: {
      ...state.loopPlan,
      validationCommands: [...state.loopPlan.validationCommands],
      acceptanceCriteria: [...state.loopPlan.acceptanceCriteria],
      workPhases: state.loopPlan.workPhases.map((phase) => ({ ...phase })),
      terminalGates: { ...state.loopPlan.terminalGates },
      verifierPlan: state.loopPlan.verifierPlan.map((verifier) => ({ ...verifier })),
    },
    workspace: {
      mode: state.workspaceConfig.mode,
      presetId: state.workspaceConfig.presetId,
      selectedWorkspaceId: state.workspaceConfig.selectedWorkspaceId,
      branchName: state.workspaceConfig.branchNameState.branchName,
      branchSelection: {
        createBranchAndWorktree: state.workspaceConfig.branchSelection.createBranchAndWorktree,
        pushBranch: state.workspaceConfig.branchSelection.pushBranch,
        branchOverride: state.workspaceConfig.branchSelection.selectedBranch,
      },
    },
    conversation: {
      provider: state.linkedType === 'plan' ? 'codex' : conversation.provider,
      model: conversation.model,
      prompt: conversation.prompt,
      autoApprove: conversation.autoApprove,
      useChatUi: conversation.useChatUi,
    },
  };
}
