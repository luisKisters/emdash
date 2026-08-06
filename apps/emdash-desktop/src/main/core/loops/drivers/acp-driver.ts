import { randomUUID } from 'node:crypto';
import type { TranscriptTurn } from '@emdash/core/acp';
import type { AcpRuntime } from '@emdash/runtime/acp-agents';
import { createConversation } from '@main/core/conversations/createConversation';
import { getConversationsForTask } from '@main/core/conversations/getConversationsForTask';
import { setSessionId } from '@main/core/conversations/set-session-id';
import { err, ok, type Result } from '@main/lib/result';
import type { Conversation } from '@shared/core/conversations/conversations';
import { resolveLoopModel, resolveLoopProvider } from '@shared/core/loops/loops';
import { getLoopAcpRuntime } from './acp-loop-runtime';
import {
  phaseConversationTitle,
  verificationConversationTitle,
  type LoopSessionDriver,
  type LoopSessionDriverError,
  type LoopSessionInfo,
  type PromptResult,
  type RestartVerificationSessionContext,
  type StartPlanningSessionContext,
  type StartPhaseSessionContext,
  type StartVerificationSessionContext,
} from './session-driver';

type ActiveLoopSession = { runtime: AcpRuntime };

const PLANNING_MODE_ID = 'read-only';

const activeSessions = new Map<string, ActiveLoopSession>();

function stopActiveSession(conversationId: string, active: ActiveLoopSession | undefined): void {
  activeSessions.delete(conversationId);
  try {
    active?.runtime.stopSession(conversationId);
  } catch {
    // The session is no longer eligible for Loop routing even if runtime cleanup throws.
  }
}

function isMeaningfulMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized !== '' && normalized !== 'undefined' && normalized !== 'null';
}

function errorMessage(error: unknown, fallback = 'ACP loop request failed'): string {
  if (error instanceof Error && isMeaningfulMessage(error.message)) return error.message;
  if (typeof error === 'string' && isMeaningfulMessage(error)) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && isMeaningfulMessage(message)) return message;
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    const causeMessage = errorMessage((error as { cause?: unknown }).cause, '');
    if (causeMessage) return causeMessage;
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const type = (error as { type?: unknown }).type;
    if (typeof type === 'string' && type.trim()) return `ACP error: ${type}`;
  }
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    const kind = (error as { kind?: unknown }).kind;
    if (typeof kind === 'string' && kind.trim()) return `ACP error: ${kind}`;
  }
  return fallback;
}

function assistantTextFromTurn(turn: TranscriptTurn): string {
  return turn.items
    .map((item) => (item.kind === 'message' && item.role === 'assistant' ? item.text : ''))
    .filter(Boolean)
    .join('');
}

function finalAssistantText(runtime: AcpRuntime, conversationId: string): string {
  const history = runtime.getChatHistory(conversationId).committed;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const text = assistantTextFromTurn(history[index]!);
    if (text.trim()) return text;
  }
  return '';
}

async function startRuntime(
  conversation: Conversation,
  ctx: Pick<StartPlanningSessionContext, 'target' | 'taskEnvironment'>
): Promise<Result<void, LoopSessionDriverError>> {
  let runtime: AcpRuntime;
  try {
    runtime = await getLoopAcpRuntime(ctx.target.machine);
  } catch (error) {
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(error, 'Failed to initialize targeted ACP runtime'),
    });
  }

  const started = await runtime.startSession({
    conversationId: conversation.id,
    projectId: conversation.projectId,
    taskId: conversation.taskId,
    providerId: conversation.providerId,
    workspaceId: ctx.target.workspaceId,
    cwd: ctx.target.path,
    sessionId: conversation.sessionId ?? null,
    model: conversation.model ?? null,
    env: { ...ctx.taskEnvironment },
  });
  if (!started.success) {
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(started.error, 'Failed to start targeted ACP conversation'),
    });
  }

  const persisted = await setSessionId(conversation.id, started.data.sessionId);
  if (!persisted.success) {
    runtime.stopSession(conversation.id);
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(persisted.error, 'Failed to persist targeted ACP session'),
    });
  }

  activeSessions.set(conversation.id, { runtime });
  return ok();
}

async function startPlanningConversation(
  ctx: StartPlanningSessionContext
): Promise<Result<LoopSessionInfo, LoopSessionDriverError>> {
  const title = 'Loop planning';
  if (activeSessions.has(ctx.conversationId)) {
    return ok({ conversationId: ctx.conversationId, title });
  }

  let conversation: Conversation | undefined;
  try {
    const conversations = await getConversationsForTask(ctx.projectId, ctx.taskId);
    conversation = conversations.find((candidate) => candidate.id === ctx.conversationId);
  } catch (error) {
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(error, 'Failed to load persisted Loop planning conversation'),
    });
  }
  if (
    !conversation ||
    conversation.type !== 'acp' ||
    conversation.providerId !== ctx.provider ||
    conversation.model !== ctx.model
  ) {
    return err({
      kind: 'hydrate-failed',
      message: 'Persisted Loop planning conversation does not match its provider and model',
    });
  }

  const started = await startRuntime(conversation, ctx);
  if (!started.success) return started;

  const active = activeSessions.get(conversation.id);
  if (!active) {
    return err({
      kind: 'hydrate-failed',
      message: 'ACP planning session did not retain its targeted runtime',
    });
  }

  try {
    const live = active.runtime.sessionLiveModels(conversation.id);
    const lifecycle = live?.states.state.snapshot().data.lifecycle;
    const modeOptions = live?.states.config.snapshot().data.modeOptions;
    if (
      lifecycle !== 'ready' ||
      !modeOptions?.available.some((mode) => mode.id === PLANNING_MODE_ID)
    ) {
      stopActiveSession(conversation.id, active);
      return err({
        kind: 'hydrate-failed',
        message: 'ACP provider does not support the required read-only planning mode',
      });
    }

    const mode = await active.runtime.setModeOption(conversation.id, PLANNING_MODE_ID);
    if (mode.success) return ok({ conversationId: conversation.id, title });

    stopActiveSession(conversation.id, active);
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(mode.error, 'Failed to enable read-only ACP planning mode'),
    });
  } catch (error) {
    stopActiveSession(conversation.id, active);
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(error, 'Failed to enable read-only ACP planning mode'),
    });
  }
}

async function startConversation(
  ctx: StartPhaseSessionContext | StartVerificationSessionContext,
  title: string
): Promise<Result<LoopSessionInfo, LoopSessionDriverError>> {
  let conversation: Conversation;
  const provider = resolveLoopProvider(ctx.loop.config);
  const model = resolveLoopModel(ctx.loop.config) ?? undefined;

  try {
    conversation = await createConversation({
      id: ctx.conversationId ?? randomUUID(),
      projectId: ctx.loop.projectId,
      taskId: ctx.loop.taskId,
      provider,
      title,
      isInitialConversation: false,
      type: 'acp',
      model,
    });
  } catch (error) {
    return err({
      kind: 'create-failed',
      message: errorMessage(error, 'Failed to create conversation'),
    });
  }

  const started = await startRuntime(conversation, ctx);
  if (!started.success) return started;
  return ok({ conversationId: conversation.id, title });
}

async function restartVerificationConversation(
  ctx: RestartVerificationSessionContext
): Promise<Result<LoopSessionInfo, LoopSessionDriverError>> {
  const active = activeSessions.get(ctx.conversationId);
  if (active) {
    const stopped = active.runtime.stopSession(ctx.conversationId);
    if (!stopped.success) {
      return err({
        kind: 'cancel-failed',
        message: errorMessage(stopped.error, 'Failed to stop stalled ACP verification runtime'),
      });
    }
    activeSessions.delete(ctx.conversationId);
  }

  let conversation: Conversation | undefined;
  try {
    const conversations = await getConversationsForTask(ctx.loop.projectId, ctx.loop.taskId);
    conversation = conversations.find((candidate) => candidate.id === ctx.conversationId);
  } catch (error) {
    return err({
      kind: 'hydrate-failed',
      message: errorMessage(error, 'Failed to reload stalled ACP verification conversation'),
    });
  }
  if (!conversation || conversation.type !== 'acp') {
    return err({
      kind: 'hydrate-failed',
      message: 'Persisted ACP verification conversation is unavailable for bounded recovery',
    });
  }

  const started = await startRuntime(conversation, ctx);
  if (!started.success) return started;
  return ok({
    conversationId: ctx.conversationId,
    title: verificationConversationTitle(ctx.loop, ctx.phase, ctx.purpose),
  });
}

function autoApprovePendingPermissions(runtime: AcpRuntime, conversationId: string): void {
  for (const request of runtime.getSessionState(conversationId).pendingPermissions) {
    const option =
      request.options.find((candidate) => candidate.kind === 'allow_always') ??
      request.options.find((candidate) => candidate.kind === 'allow_once') ??
      request.options.find((candidate) =>
        /allow/i.test(`${candidate.optionId} ${candidate.name}`)
      ) ??
      request.options[0];
    if (option) runtime.resolvePermission(conversationId, request.requestId, option.optionId);
  }
}

function rejectPendingPermissions(runtime: AcpRuntime, conversationId: string): Result<void, void> {
  for (const request of runtime.getSessionState(conversationId).pendingPermissions) {
    const option =
      request.options.find((candidate) => candidate.kind === 'reject_always') ??
      request.options.find((candidate) => candidate.kind === 'reject_once') ??
      request.options.find((candidate) =>
        /reject|deny/i.test(`${candidate.optionId} ${candidate.name}`)
      );
    if (!option) return err(undefined);
    const result = runtime.resolvePermission(conversationId, request.requestId, option.optionId);
    if (!result.success) return err(undefined);
  }
  return ok();
}

async function promptWithAutoApproval(runtime: AcpRuntime, conversationId: string, text: string) {
  let settled = false;
  const prompt = runtime.sendPrompt(conversationId, { text }).finally(() => {
    settled = true;
  });

  while (!settled) {
    autoApprovePendingPermissions(runtime, conversationId);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return prompt;
}

async function promptWithPermissionRejection(
  runtime: AcpRuntime,
  conversationId: string,
  text: string
) {
  let settled = false;
  let permissionRejected = true;
  const prompt = runtime.sendPrompt(conversationId, { text }).finally(() => {
    settled = true;
  });

  while (!settled && permissionRejected) {
    try {
      permissionRejected = rejectPendingPermissions(runtime, conversationId).success;
    } catch {
      permissionRejected = false;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!permissionRejected) {
    let cancellationFailed = false;
    try {
      cancellationFailed = !(await runtime.cancelTurn(conversationId)).success;
    } catch {
      cancellationFailed = true;
    }
    void prompt.catch(() => {});
    return err({
      kind: 'prompt-failed' as const,
      message: cancellationFailed
        ? 'ACP planning permission request could not be denied and cancellation failed'
        : 'ACP planning permission request could not be denied',
    });
  }
  return prompt;
}

export const acpLoopSessionDriver: LoopSessionDriver = {
  kind: 'acp',

  async startPhaseSession(
    ctx: StartPhaseSessionContext
  ): Promise<Result<LoopSessionInfo, LoopSessionDriverError>> {
    return startConversation(ctx, phaseConversationTitle(ctx.loop, ctx.phase, ctx.purpose));
  },

  async startVerificationSession(
    ctx: StartVerificationSessionContext
  ): Promise<Result<LoopSessionInfo, LoopSessionDriverError>> {
    return startConversation(ctx, verificationConversationTitle(ctx.loop, ctx.phase, ctx.purpose));
  },

  restartVerificationSession: restartVerificationConversation,

  startPlanningSession: startPlanningConversation,

  async sendPlanningPrompt(
    conversationId: string,
    text: string
  ): Promise<Result<PromptResult, LoopSessionDriverError>> {
    const active = activeSessions.get(conversationId);
    if (!active) {
      return err({
        kind: 'prompt-failed',
        message: 'ACP planning conversation is not running in its targeted Loop runtime',
      });
    }
    const result = await promptWithPermissionRejection(active.runtime, conversationId, text);
    if (!result.success) {
      return err({
        kind: 'prompt-failed',
        message: errorMessage(result.error, 'ACP planning prompt failed'),
      });
    }
    return ok({ finalText: finalAssistantText(active.runtime, conversationId) });
  },

  async sendPrompt(
    conversationId: string,
    text: string
  ): Promise<Result<PromptResult, LoopSessionDriverError>> {
    const active = activeSessions.get(conversationId);
    if (!active) {
      return err({
        kind: 'prompt-failed',
        message: 'ACP conversation is not running in its targeted Loop runtime',
      });
    }

    const result = await promptWithAutoApproval(active.runtime, conversationId, text);
    if (!result.success) {
      return err({
        kind: 'prompt-failed',
        message: errorMessage(result.error, 'ACP prompt failed'),
      });
    }
    return ok({ finalText: finalAssistantText(active.runtime, conversationId) });
  },

  async cancelPrompt(conversationId: string): Promise<Result<void, LoopSessionDriverError>> {
    const active = activeSessions.get(conversationId);
    if (!active) return ok();
    const result = await active.runtime.cancelTurn(conversationId);
    if (!result.success) {
      return err({
        kind: 'cancel-failed',
        message: errorMessage(result.error, 'ACP cancel failed'),
      });
    }
    return ok();
  },
};
