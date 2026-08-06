import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import type { InitialConversationState } from '../task-config/initial-conversation-section';
import {
  getCreateTaskDisabledReason,
  useCreateTaskCallback,
  type CreateTaskBlockers,
} from './use-create-task-callback';
import type { CreateTaskState } from './use-create-task-state';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  createTaskWithLoop: vi.fn(),
  getTaskView: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@renderer/features/tasks/stores/task-selectors', () => ({
  getTaskManagerStore: () => ({
    createTask: mocks.createTask,
    createTaskWithLoop: mocks.createTaskWithLoop,
  }),
  getTaskView: mocks.getTaskView,
}));

vi.mock('@renderer/utils/logger', () => ({ log: { error: vi.fn() } }));

function initialConversation(): InitialConversationState {
  return {
    provider: 'codex',
    setProvider: () => {},
    prompt: 'This must be suppressed for a Loop',
    setPrompt: () => {},
    issueContext: null,
    setIssueContext: () => {},
    issueMentionContexts: {},
    setIssueMentionContext: () => {},
    autoApprove: true,
    setAutoApprove: () => {},
    issueContextEditorOpen: false,
    setIssueContextEditorOpen: () => {},
    model: 'gpt-5.6-sol',
    setModel: () => {},
    useChatUi: true,
    setUseChatUi: () => {},
  };
}

function createState(loopEnabled: boolean): CreateTaskState {
  return {
    linkedType: null,
    linkedIssue: null,
    linkedPR: null,
    taskName: { effectiveTaskName: 'Feature task' },
    workspaceConfig: { resolvedConfig: { workspace: { kind: 'new-worktree' } } },
    loopPlan: {
      ...createDefaultLoopPlanDraft(),
      enabled: loopEnabled,
      goal: 'Ship the feature',
      validationCommands: ['pnpm test'],
      workPhases: [{ id: 'work-1', kind: 'work', name: 'Build', goal: 'Build it' }],
    },
    isValid: true,
  } as CreateTaskState;
}

describe('useCreateTaskCallback', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce('task-1').mockReturnValueOnce('loop-1'),
    });
    container = dom.window.document.getElementById('root')!;
    root = createRoot(container);
    mocks.createTask.mockResolvedValue(undefined);
    mocks.createTaskWithLoop.mockResolvedValue({ id: 'loop-1' });
    mocks.getTaskView.mockReturnValue({ paneLayout: { open: mocks.open } });
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  async function renderCreateCallback(
    loopEnabled: boolean,
    conversation: InitialConversationState = initialConversation()
  ) {
    const navigate = vi.fn();
    const onClose = vi.fn();
    let create!: () => Promise<void>;

    function Harness() {
      create = useCreateTaskCallback({
        selectedProjectId: 'project-1',
        state: createState(loopEnabled),
        initialConversation: conversation,
        navigate,
        onClose,
      }).handleCreateTask;
      return null;
    }

    await act(async () => root.render(React.createElement(Harness)));
    return { create, navigate, onClose };
  }

  async function renderAndCreate(
    loopEnabled: boolean,
    conversation: InitialConversationState = initialConversation()
  ) {
    const { create, navigate, onClose } = await renderCreateCallback(loopEnabled, conversation);
    await act(async () => create());
    return { navigate, onClose };
  }

  it('starts atomic creation and opens the optimistic Loop tab after navigation', async () => {
    let finishCreation: ((value: { id: string }) => void) | undefined;
    mocks.createTaskWithLoop.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCreation = resolve;
      })
    );
    const { create, navigate, onClose } = await renderCreateCallback(true);

    const pending = create();

    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(mocks.createTaskWithLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          id: 'task-1',
          taskConfig: expect.objectContaining({ initialConversation: undefined }),
        }),
        loop: expect.objectContaining({ id: 'loop-1' }),
      })
    );
    expect(mocks.getTaskView).toHaveBeenCalledWith('project-1', 'task-1');
    expect(mocks.open).toHaveBeenCalledWith('loop', { loopId: 'loop-1' }, { preview: false });
    expect(mocks.createTaskWithLoop.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.open.mock.invocationCallOrder[0]
    );
    expect(navigate).toHaveBeenCalledWith('task', { projectId: 'project-1', taskId: 'task-1' });
    expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.open.mock.invocationCallOrder[0]
    );
    expect(onClose).toHaveBeenCalledOnce();

    finishCreation?.({ id: 'loop-1' });
    await act(async () => pending);
  });

  it('leaves ordinary task creation unchanged when Loop mode is off', async () => {
    await renderAndCreate(false);

    expect(mocks.createTaskWithLoop).not.toHaveBeenCalled();
    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskConfig: expect.objectContaining({
          initialConversation: expect.objectContaining({ provider: 'codex' }),
        }),
      })
    );
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does not create a Loop until an explicit Codex catalog model is selected', async () => {
    const conversation = initialConversation();
    conversation.model = null;

    const { navigate, onClose } = await renderAndCreate(true, conversation);

    expect(mocks.createTaskWithLoop).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each<{
    name: string;
    change: Partial<CreateTaskBlockers>;
    reason: string;
  }>([
    { name: 'no project', change: { projectId: undefined }, reason: 'Select a project.' },
    { name: 'empty task name', change: { taskName: ' ' }, reason: 'Enter a task name.' },
    {
      name: 'pending generated task name',
      change: { taskName: '', taskNamePending: true },
      reason: 'Wait for the task name to finish generating.',
    },
    {
      name: 'missing Loop provider',
      change: { provider: null },
      reason: 'Loops require the Codex provider.',
    },
    {
      name: 'unsupported Loop provider',
      change: { provider: 'claude' },
      reason: 'Loops require the Codex provider.',
    },
    {
      name: 'missing Loop model',
      change: { model: null },
      reason: 'Select a Codex model.',
    },
    {
      name: 'branch conflict',
      change: { workspaceReason: 'This branch is already checked out in another workspace.' },
      reason: 'This branch is already checked out in another workspace.',
    },
    {
      name: 'branch exists',
      change: { workspaceReason: 'A branch with this name already exists.' },
      reason: 'A branch with this name already exists.',
    },
    {
      name: 'missing PR data',
      change: { workspaceReason: 'Select a pull request for this workspace preset.' },
      reason: 'Select a pull request for this workspace preset.',
    },
    {
      name: 'no selected workspace',
      change: { workspaceReason: 'Select a workspace.' },
      reason: 'Select a workspace.',
    },
  ])('returns the precise disabled reason for $name', ({ change, reason }) => {
    const valid: CreateTaskBlockers = {
      projectId: 'project-1',
      taskName: 'Feature task',
      taskNamePending: false,
      loopEnabled: true,
      provider: 'codex',
      model: 'gpt-5',
      workspaceReason: null,
    };
    expect(getCreateTaskDisabledReason({ ...valid, ...change })).toBe(reason);
  });
});
