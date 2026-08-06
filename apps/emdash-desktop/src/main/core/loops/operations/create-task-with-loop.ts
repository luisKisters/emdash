import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import {
  commitCreateTask,
  finalizeCreateTask,
  prepareCreateTask,
} from '@main/core/tasks/operations/createTask';
import { db } from '@main/db/client';
import type { ConversationRow } from '@main/db/schema';
import { err, ok, type Result } from '@main/lib/result';
import type { Conversation } from '@shared/core/conversations/conversations';
import type { LoopWithPhases } from '@shared/core/loops/loops';
import { DEFAULT_LOOP_PROVIDER } from '@shared/core/loops/loops';
import type {
  CreateTaskError,
  CreateTaskParams,
  CreateTaskSuccess,
} from '@shared/core/tasks/tasks';
import {
  commitPreparedLoop,
  commitPreparedPlanningConversation,
  prepareNewLoop,
  type NewLoopAuthoringInput,
} from './loop-operations';
import type { LoopOperationError } from './types';

export type CreateTaskWithLoopParams = {
  task: CreateTaskParams;
  loop: Omit<NewLoopAuthoringInput, 'projectId' | 'taskId' | 'provider'>;
};

export type CreateTaskWithLoopSuccess = {
  task: CreateTaskSuccess;
  loop: LoopWithPhases;
  planningConversation?: Conversation;
};

export type CreateTaskWithLoopError = LoopOperationError | CreateTaskError;

export async function createTaskWithLoop(
  params: CreateTaskWithLoopParams
): Promise<Result<CreateTaskWithLoopSuccess, CreateTaskWithLoopError>> {
  if (params.task.taskConfig.initialConversation) {
    return err({
      kind: 'invalid-input',
      message: 'Loop tasks cannot create a separate initial conversation',
    });
  }

  const preparedTask = await prepareCreateTask(params.task);
  if (!preparedTask.success) return preparedTask;

  const preparedLoop = prepareNewLoop({
    ...params.loop,
    projectId: params.task.projectId,
    taskId: params.task.id,
    provider: DEFAULT_LOOP_PROVIDER,
  });
  if (!preparedLoop.success) return preparedLoop;

  try {
    let taskCommit!: ReturnType<typeof commitCreateTask>;
    let loop!: LoopWithPhases;
    let planningConversationRow: ConversationRow | undefined;
    db.transaction((tx) => {
      taskCommit = commitCreateTask(preparedTask.data, tx);
      planningConversationRow = commitPreparedPlanningConversation(preparedLoop.data, tx);
      loop = commitPreparedLoop(preparedLoop.data, tx);
    });

    const task = finalizeCreateTask(preparedTask.data, taskCommit.taskRow, taskCommit.convRow);
    const planningConversation = planningConversationRow
      ? mapConversationRowToConversation(planningConversationRow)
      : undefined;
    return ok({ task, loop, ...(planningConversation ? { planningConversation } : {}) });
  } catch (error) {
    return err({
      kind: 'db-error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
