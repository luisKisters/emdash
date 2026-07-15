import { randomUUID } from 'node:crypto';
import { isErr } from '@emdash/shared';
import { eq } from 'drizzle-orm';
import { acpSessionManager } from '@main/core/acp/production-acp-session-manager';
import { createConversation } from '@main/core/conversations/createConversation';
import { hydrateConversation } from '@main/core/conversations/hydrateConversation';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import type { AgentProviderId } from '@shared/core/agents/agent-provider-registry';
import { resolveLoopGithubContext, toGithubFacts } from '../github/loop-github-context';
import { renderGithubFacts } from '../prompt-builder';
import type { LoopSessionDriver, LoopTurnInput, LoopTurnResult } from './session-driver';

export interface AcpLoopDriverOptions {
  provider?: AgentProviderId;
  model?: string;
}

/**
 * Real loop driver: runs each phase as a FRESH ACP conversation turn, mirroring
 * the existing conversation flow (createConversation → hydrateConversation →
 * acpSessionManager.prompt → getChatHistory). The turn's final assistant text is
 * returned for sentinel parsing. Honors the AbortSignal via acpSessionManager.cancel.
 */
export class AcpLoopDriver implements LoopSessionDriver {
  private readonly provider: AgentProviderId;
  private readonly model?: string;

  constructor(options: AcpLoopDriverOptions = {}) {
    this.provider = options.provider ?? 'claude';
    this.model = options.model;
  }

  async runTurn(input: LoopTurnInput): Promise<LoopTurnResult> {
    const projectId = await resolveProjectId(input.taskId);

    let conversationId = input.conversationId;
    if (!conversationId) {
      conversationId = randomUUID();
      await createConversation({
        id: conversationId,
        projectId,
        taskId: input.taskId,
        provider: this.provider,
        title: 'Loop phase',
        type: 'acp',
        ...(this.model ? { model: this.model } : {}),
      });
    }

    await hydrateConversation(projectId, input.taskId, conversationId);

    // Always give the phase agent GitHub context (repo/PR facts) in its prompt.
    // Token injection into the agent process is intentionally NOT done here: the ACP
    // process is shared per provider+machine with no per-conversation env seam.
    const githubFacts = renderGithubFacts(
      toGithubFacts(await resolveLoopGithubContext(input.taskId))
    );
    const prompt = githubFacts ? `${input.prompt}\n${githubFacts}` : input.prompt;

    const onAbort = () => {
      void acpSessionManager.cancel(conversationId);
    };
    if (input.signal.aborted) onAbort();
    input.signal.addEventListener('abort', onAbort);

    try {
      const result = await acpSessionManager.prompt(conversationId, prompt);
      if (isErr(result)) {
        throw new Error(`ACP prompt failed: ${result.error.type}`);
      }
    } finally {
      input.signal.removeEventListener('abort', onAbort);
    }

    return { finalText: readFinalAssistantText(conversationId) };
  }
}

async function resolveProjectId(taskId: string): Promise<string> {
  const [row] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) throw new Error(`Task not found: ${taskId}`);
  return row.projectId;
}

/** Concatenates the assistant message text of the last committed turn. */
function readFinalAssistantText(conversationId: string): string {
  const history = acpSessionManager.getChatHistory(conversationId);
  const lastTurn = history.turns.at(-1);
  if (!lastTurn) return '';
  return lastTurn.updates
    .map((u) => u.update)
    .filter((update) => update.kind === 'message' && update.role === 'assistant')
    .map((update) => (update.kind === 'message' ? update.text : ''))
    .join('');
}
