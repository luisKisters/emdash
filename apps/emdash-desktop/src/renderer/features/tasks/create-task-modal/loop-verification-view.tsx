import { Repeat2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { type ReactNode, useMemo, useState } from 'react';
import type { GuardResult } from '@renderer/app/view-registry';
import { ProjectViewWrapper } from '@renderer/features/projects/components/project-view-wrapper';
import {
  getProjectStore,
  projectDisplayName,
} from '@renderer/features/projects/stores/project-selectors';
import { useTaskSettings } from '@renderer/features/tasks/hooks/useTaskSettings';
import { useInitialConversationState } from '@renderer/features/tasks/task-config/initial-conversation-section';
import { TaskStateProvider } from '@renderer/features/tasks/task-config/task-state-context';
import { WorkspaceSettingsSection } from '@renderer/features/tasks/task-config/workspace-settings-section';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useFeatureFlag } from '@renderer/lib/hooks/useFeatureFlag';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { showModal } from '@renderer/lib/modal/modal-provider';
import { appState } from '@renderer/lib/stores/app-state';
import { useAgents } from '@renderer/lib/stores/use-agents';
import { Button } from '@renderer/lib/ui/button';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@renderer/lib/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import {
  isCreateTaskDraft,
  snapshotCreateTaskDraft,
  type CreateTaskDraft,
} from './create-task-draft';
import { returnToCreateTask } from './create-task-flow';
import { useCreateTaskCallback } from './use-create-task-callback';
import { useCreateTaskState } from './use-create-task-state';
import { useProjectGitContext } from './use-project-git-context';
import { VerifierPicker } from './verifier-picker';

function LoopVerificationViewWrapper({
  children,
  projectId,
  draft: _draft,
}: {
  children: ReactNode;
  projectId: string;
  draft: CreateTaskDraft;
}) {
  return <ProjectViewWrapper projectId={projectId}>{children}</ProjectViewWrapper>;
}

function LoopVerificationTitlebar() {
  const {
    params: { projectId },
  } = useParams('loopVerification');
  return (
    <Titlebar
      leftSlot={
        <div className="flex items-center gap-2 px-2 text-sm text-foreground-muted">
          <span>{projectDisplayName(getProjectStore(projectId))}</span>
          <span className="text-foreground-passive">/</span>
          <span>Verification</span>
        </div>
      }
    />
  );
}

export const LoopVerificationMainPanel = observer(function LoopVerificationMainPanel() {
  const {
    params: { projectId, draft },
  } = useParams('loopVerification');
  const { defaultBranch, isUnborn, currentBranch, repositoryWorkspaceId } =
    useProjectGitContext(projectId);
  const state = useCreateTaskState(
    projectId,
    defaultBranch,
    isUnborn,
    currentBranch,
    repositoryWorkspaceId,
    draft.linkedPR ?? undefined,
    draft.linkedType,
    draft
  );
  const { autoApproveByDefault, includeIssueContextByDefault } = useTaskSettings();
  const initialConversation = useInitialConversationState(
    projectId,
    'codex',
    autoApproveByDefault,
    {
      initial: draft.conversation,
    }
  );
  const [verifierSelectionInitialized, setVerifierSelectionInitialized] = useState(
    draft.verifierSelectionInitialized
  );
  const isWorkspaceProviderEnabled = useFeatureFlag('workspace-provider');
  const { navigate } = useNavigate();
  const { data: agents } = useAgents();
  const codexModels = useMemo(() => {
    const capability = agents?.find((agent) => agent.id === 'codex')?.capabilities.models;
    return capability?.kind === 'selectable' ? capability.modelOptions : null;
  }, [agents]);
  const { handleCreateTask, canCreate, disabledReason } = useCreateTaskCallback({
    selectedProjectId: projectId,
    state,
    initialConversation,
    navigate,
    onClose: () => {},
  });

  const snapshot = (): ReturnType<typeof snapshotCreateTaskDraft> =>
    snapshotCreateTaskDraft(projectId, state, initialConversation, verifierSelectionInitialized);

  const handleBack = (): void => {
    returnToCreateTask(snapshot(), navigate, (args) => showModal('taskModal', args));
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-[41px] shrink-0 items-center border-b border-border bg-background-secondary px-3">
        <div className="flex h-full items-center gap-2 border-r border-border px-3 text-sm text-foreground">
          <Repeat2 className="size-4" />
          Verification
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
          <header className="flex flex-col gap-2">
            <h1 className="text-xl font-normal text-foreground">Verify Loop setup</h1>
            <p className="text-sm text-foreground-muted">
              Select the checks that the planning agent must use for{' '}
              {state.taskName.effectiveTaskName}.
            </p>
          </header>

          <FieldGroup>
            <Field>
              <FieldLabel>Plan</FieldLabel>
              <FieldDescription>{draft.selectedPlanPath ?? 'Pasted Markdown'}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Codex model</FieldLabel>
              <Select
                value={initialConversation.model ?? ''}
                onValueChange={(model) => initialConversation.setModel(model || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a Codex model">
                    {initialConversation.model
                      ? (codexModels?.[initialConversation.model]?.name ??
                        initialConversation.model)
                      : 'Select a Codex model'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(codexModels ?? {}).map(([id, model]) => (
                    <SelectItem key={id} value={id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Verifiers</FieldLabel>
              <VerifierPicker
                projectId={projectId}
                value={state.loopPlan}
                initialized={verifierSelectionInitialized}
                onChange={(loopPlan, initialized) => {
                  state.setLoopPlan(loopPlan);
                  setVerifierSelectionInitialized(initialized);
                }}
              />
            </Field>
          </FieldGroup>

          <TaskStateProvider
            workspaceConfig={state.workspaceConfig}
            initialConversation={initialConversation}
            projectId={projectId}
            isUnborn={isUnborn}
            hasPR={state.linkedType === 'pr' && state.linkedPR !== null}
            isWorkspaceProviderEnabled={isWorkspaceProviderEnabled}
            linkedIssue={
              state.linkedType === 'issue' ? (state.linkedIssue ?? undefined) : undefined
            }
            includeIssueContextByDefault={includeIssueContextByDefault}
          >
            <WorkspaceSettingsSection defaultOpen={false} />
          </TaskStateProvider>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Button type="button" size="sm" variant="secondary" onClick={handleBack}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {disabledReason ? (
                <span className="text-xs text-foreground-destructive">{disabledReason}</span>
              ) : null}
              <ConfirmButton
                size="sm"
                disabled={!canCreate}
                disabledReason={disabledReason}
                onClick={() => void handleCreateTask()}
              >
                Create
              </ConfirmButton>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
});

export const loopVerificationView = {
  WrapView: LoopVerificationViewWrapper,
  TitlebarSlot: LoopVerificationTitlebar,
  MainPanel: LoopVerificationMainPanel,
  canActivate: (params: unknown): GuardResult => {
    if (typeof params !== 'object' || params === null) return { ok: false, redirect: 'home' };
    const candidate = params as { projectId?: unknown; draft?: unknown };
    if (typeof candidate.projectId !== 'string' || !isCreateTaskDraft(candidate.draft)) {
      return { ok: false, redirect: 'home' };
    }
    if (candidate.projectId !== candidate.draft.projectId) return { ok: false, redirect: 'home' };
    return appState.projects.projects.has(candidate.projectId)
      ? { ok: true }
      : { ok: false, redirect: 'home' };
  },
};
