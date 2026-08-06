import { observer } from 'mobx-react-lite';
import { useMemo } from 'react';
import { useConnectedIssueProviders } from '@renderer/features/integrations/use-connected-issue-providers';
import { CreateTaskLoopSection } from '@renderer/features/loops/create-task-loop-section';
import {
  getProjectManagerStore,
  getGitRepositoryStore,
  mountedProjectData,
} from '@renderer/features/projects/stores/project-selectors';
import { useTaskSettings } from '@renderer/features/tasks/hooks/useTaskSettings';
import { ConversationField } from '@renderer/features/tasks/task-config/conversation-field';
import { useInitialConversationState } from '@renderer/features/tasks/task-config/initial-conversation-section';
import { TaskConfigPanel } from '@renderer/features/tasks/task-config/task-config-panel';
import { TaskStateProvider } from '@renderer/features/tasks/task-config/task-state-context';
import { WorkspaceSettingsSection } from '@renderer/features/tasks/task-config/workspace-settings-section';
import { useFeatureFlag } from '@renderer/lib/hooks/useFeatureFlag';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import type { PullRequest } from '@shared/core/pull-requests/pull-requests';
import { snapshotCreateTaskDraft, type CreateTaskDraft } from './create-task-draft';
import { continueToLoopVerification } from './create-task-flow';
import { LinkedEntitySection } from './linked-entity-section';
import { TaskNameField } from './task-name-field';
import { useCreateTaskCallback } from './use-create-task-callback';
import { type LinkedType, useCreateTaskState } from './use-create-task-state';
import { useProjectGitContext } from './use-project-git-context';

function useDefaultProjectId(propProjectId?: string): string | undefined {
  return useMemo(() => {
    if (propProjectId) return propProjectId;
    const nav = appState.navigation;
    const navProjectId =
      nav.currentViewId === 'task'
        ? (nav.viewParamsStore['task'] as { projectId?: string } | undefined)?.projectId
        : nav.currentViewId === 'project'
          ? (nav.viewParamsStore['project'] as { projectId?: string } | undefined)?.projectId
          : undefined;
    return (
      navProjectId ??
      Array.from(getProjectManagerStore().projects.values())
        .reverse()
        .find((p) => p.state === 'mounted')?.data?.id
    );
    // oxlint-disable-next-line react/exhaustive-deps
  }, []); // computed once on mount
}

export const CreateTaskModal = observer(function CreateTaskModal({
  projectId,
  strategy: initialStrategy = 'from-branch',
  initialPR,
  draft,
  onClose,
}: BaseModalProps & {
  projectId?: string;
  strategy?: 'from-branch' | 'from-issue' | 'from-pull-request';
  initialPR?: PullRequest;
  draft?: CreateTaskDraft;
}) {
  const selectedProjectId = useDefaultProjectId(draft?.projectId ?? projectId);

  const projectData = selectedProjectId
    ? mountedProjectData(getProjectManagerStore().projects.get(selectedProjectId))
    : null;

  const { defaultBranch, isUnborn, currentBranch, repositoryWorkspaceId } =
    useProjectGitContext(selectedProjectId);

  const repositoryStore = selectedProjectId ? getGitRepositoryStore(selectedProjectId) : undefined;
  const pullRequestRepositoryUrl = repositoryStore?.pullRequestRepositoryUrl ?? undefined;
  const repositoryUrl = repositoryStore?.canonicalRepositoryUrl ?? pullRequestRepositoryUrl;

  const projectPath = projectData?.path;

  const { hasAnyIssueIntegration } = useConnectedIssueProviders({ repositoryUrl, projectPath });
  const hasPrSupport = !!pullRequestRepositoryUrl;

  const defaultLinkedType = useMemo((): LinkedType => {
    if (initialStrategy === 'from-pull-request') return 'pr';
    if (initialStrategy === 'from-issue') return 'issue';
    if (hasAnyIssueIntegration) return 'issue';
    if (hasPrSupport) return 'pr';
    return null;
    // oxlint-disable-next-line react/exhaustive-deps
  }, []); // computed once on mount

  const resolvedInitialPR = initialStrategy === 'from-pull-request' ? initialPR : undefined;
  const state = useCreateTaskState(
    selectedProjectId,
    defaultBranch,
    isUnborn,
    currentBranch,
    repositoryWorkspaceId,
    resolvedInitialPR,
    defaultLinkedType,
    draft
  );

  const { autoApproveByDefault, includeIssueContextByDefault } = useTaskSettings();
  const initialConversation = useInitialConversationState(
    selectedProjectId,
    draft?.conversation.provider ?? undefined,
    autoApproveByDefault,
    { initial: draft?.conversation }
  );
  const isWorkspaceProviderEnabled = useFeatureFlag('workspace-provider');
  const { navigate } = useNavigate();

  const { handleCreateTask, canCreate, disabledReason } = useCreateTaskCallback({
    selectedProjectId,
    state,
    initialConversation,
    navigate,
    onClose,
  });
  const continueReason = !selectedProjectId
    ? 'Select a project.'
    : state.taskName.isPending
      ? 'Wait for the task name to finish generating.'
      : !state.taskName.effectiveTaskName.trim()
        ? 'Enter a task name.'
        : !state.loopPlan.planSource.trim()
          ? 'Select or paste a plan.'
          : null;
  const isPlanFlow = state.linkedType === 'plan';

  const handleContinue = (): void => {
    if (!selectedProjectId || continueReason) return;
    const nextDraft = snapshotCreateTaskDraft(
      selectedProjectId,
      state,
      initialConversation,
      draft?.verifierSelectionInitialized
    );
    continueToLoopVerification(nextDraft, onClose, navigate);
  };

  return (
    <>
      <DialogHeader className="flex items-center gap-2">
        <DialogTitle>Create Task</DialogTitle>
      </DialogHeader>
      <DialogContentArea>
        <div className="flex w-full flex-col gap-5">
          <TaskNameField state={state.taskName} />
          <LinkedEntitySection
            state={state}
            hasAnyIssueIntegration={hasAnyIssueIntegration}
            hasPrSupport={hasPrSupport}
            projectId={selectedProjectId}
            repositoryUrl={repositoryUrl}
            projectPath={projectPath}
            repositoryWorkspaceId={repositoryWorkspaceId}
          />
          {!isPlanFlow ? (
            <CreateTaskLoopSection value={state.loopPlan} onChange={state.setLoopPlan} />
          ) : null}
          <TaskStateProvider
            workspaceConfig={state.workspaceConfig}
            initialConversation={initialConversation}
            projectId={selectedProjectId}
            isUnborn={isUnborn}
            hasPR={state.linkedType === 'pr' && state.linkedPR !== null}
            isWorkspaceProviderEnabled={isWorkspaceProviderEnabled}
            linkedIssue={
              state.linkedType === 'issue' ? (state.linkedIssue ?? undefined) : undefined
            }
            includeIssueContextByDefault={includeIssueContextByDefault}
          >
            <TaskConfigPanel
              tabs={[
                ...(state.loopPlan.enabled
                  ? []
                  : [
                      {
                        value: 'conversation',
                        label: 'Initial Conversation',
                        content: <ConversationField />,
                      },
                    ]),
                {
                  value: 'workspace',
                  label: 'Workspace Settings',
                  content: <WorkspaceSettingsSection defaultOpen={false} />,
                },
              ]}
            />
          </TaskStateProvider>
        </div>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton
          size="sm"
          onClick={isPlanFlow ? handleContinue : handleCreateTask}
          disabled={
            isPlanFlow
              ? continueReason !== null
              : !canCreate || initialConversation.issueContextEditorOpen
          }
          disabledReason={isPlanFlow ? continueReason : disabledReason}
        >
          {isPlanFlow ? 'Continue' : 'Create'}
        </ConfirmButton>
        {(isPlanFlow ? continueReason : disabledReason) ? (
          <span className="text-xs text-foreground-destructive">
            {isPlanFlow ? continueReason : disabledReason}
          </span>
        ) : null}
      </DialogFooter>
    </>
  );
});
