import { and, eq } from 'drizzle-orm';
import { acpSessionManager } from '@main/core/acp/production-acp-session-manager';
import { resolveTaskWorkspaceTarget } from '@main/core/workspaces/resolve-task-workspace-target';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { resolveTask } from '../projects/utils';
import { mapConversationRowToConversation } from './utils';

export async function hydrateConversation(
  projectId: string,
  taskId: string,
  conversationId: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, projectId),
        eq(conversations.taskId, taskId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Conversation not found');

  const conversation = mapConversationRowToConversation(row);

  if (conversation.type === 'acp') {
    if (acpSessionManager.isRunning(conversationId)) return;

    const target = await resolveTaskWorkspaceTarget(taskId);
    if (!target.success) throw new Error(target.error.message);

    const config = row.config;
    const isFirstSpawn = row.sessionId === null;

    await acpSessionManager.start(
      conversation,
      target.data.workspaceId,
      target.data.path,
      target.data.machine,
      isFirstSpawn ? config?.initialPrompt : undefined
    );
    return;
  }

  // PTY path.
  const task = resolveTask(projectId, taskId);
  if (!task) throw new Error('Task not found');

  const isFirstSpawn = row.sessionId === null;

  if (isFirstSpawn) {
    // Write session_id before spawning — idempotency guard against double-hydrate.
    await db
      .update(conversations)
      .set({ sessionId: conversationId })
      .where(eq(conversations.id, conversationId));
  }

  const config = row.config;
  const isResuming = !isFirstSpawn;

  await task.conversations.startSession(
    mapConversationRowToConversation(row, isResuming),
    undefined,
    isResuming,
    isFirstSpawn ? config?.initialPrompt : undefined
  );
}
