import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { getPlugin } from '@main/core/agents/plugin-registry';
import { conversationEvents } from '@main/core/conversations/conversation-events';
import { projectManager } from '@main/core/projects/project-manager';
import { workspaceFileIndexService } from '@main/core/search/workspace-file-index-service';
import { getTasks } from '@main/core/tasks/operations/getTasks';
import { taskService } from '@main/core/tasks/task-service';
import { resolveTaskWorkspaceTarget } from '@main/core/workspaces/resolve-task-workspace-target';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { err, ok, type Result } from '@main/lib/result';
import { conversationCreatedChannel } from '@shared/core/conversations/conversationEvents';
import type { LoopSessionAttempt, LoopStateV2 } from '@shared/core/loops/loop-state';
import { loopPhaseUpdatedChannel, loopUpdatedChannel } from '@shared/core/loops/loopEvents';
import {
  VERIFIER_IDS,
  type CreateLoopParams,
  type Loop,
  type LoopPhase,
  type LoopProviderId,
  type LoopVerifierAvailability,
  type LoopWithPhases,
  newLoopConfigV2Schema,
} from '@shared/core/loops/loops';
import type { DetectedVerifier, SelectedVerifier } from '@shared/core/loops/verifier-catalog';
import type { WorkspaceFileHit } from '@shared/core/search';
import { assertWorkspaceReadAllowed } from '../files/file-system/workspace-file-policy';
import { detectVerifiers as detectRepoVerifiers } from './detection/detect-verifiers';
import { getLoopSessionDriver } from './drivers/driver-registry';
import {
  resolvePromptTimeoutMs,
  safeMessage,
  sendPromptWithTimeout,
} from './drivers/prompt-timeout';
import type { LoopSessionDriver } from './drivers/session-driver';
import {
  createTaskWithLoop as createTaskWithLoopOperation,
  type CreateTaskWithLoopError,
  type CreateTaskWithLoopParams,
  type CreateTaskWithLoopSuccess,
} from './operations/create-task-with-loop';
import {
  assertLoopRunnable,
  beginLoopPreparationRetry,
  createLoop as createLoopOperation,
  deleteLoop as deleteLoopOperation,
  failLoopPreparation,
  getLoop as getLoopOperation,
  getLoopsForProject as getLoopsForProjectOperation,
  pauseRunningLoopsForBoot,
  resetPhaseForRetry,
  settlePreparingLoopsForBoot,
  updateLoop,
  updatePhase,
  MAX_LOOP_PLAN_SOURCE_BYTES,
} from './operations/loop-operations';
import { replaceLoopPhases } from './operations/replace-loop-phases';
import { commitSessionAttempt } from './operations/session-progress';
import type { LoopOperationError } from './operations/types';
import { PhaseRunner, type LoopRunControl } from './phase-runner';
import { buildLoopPlanPrompt, parseLoopPlan, type LoopPlanResult } from './plan-prompt';
import { runLoopCommand } from './runtime/loop-command-runner';
import {
  resolveLoopExecutionTarget,
  type LoopExecutionTarget,
} from './runtime/loop-execution-target';
import { getVerifier } from './verifiers/registry';

export type LoopServiceError =
  | LoopOperationError
  | { kind: 'feature-disabled'; message: string }
  | { kind: 'invalid-state'; message: string }
  | { kind: 'workspace-unavailable'; message: string }
  | { kind: 'run-failed'; message: string };

export type DetectVerifiersParams = {
  projectId: string;
  provider: LoopProviderId;
};

export type DetectVerifiersResult = {
  verifiers: DetectedVerifier[];
  availability: LoopVerifierAvailability[];
};

export const DEFAULT_LOOP_STOP_SETTLEMENT_TIMEOUT_MS = 10_000;
export const DEFAULT_LOOP_PLANNING_TIMEOUT_MS = 90_000;

type SettledWithin<T> = { settled: true; value: T } | { settled: false };

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<SettledWithin<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SettledWithin<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ settled: false }), timeoutMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([
      promise.then((value): SettledWithin<T> => ({ settled: true, value })),
      deadline,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class LoopRunHandle implements LoopRunControl {
  private readonly abortController = new AbortController();
  private readonly completion: Promise<void>;
  private resolveCompletion!: () => void;
  private completed = false;
  private reason: 'pause' | 'cancel' | null = null;
  private stopFailureMessage: string | null = null;
  private activeConversationId: string | null = null;
  private activeDriver: LoopSessionDriver | null = null;

  currentPhaseId: string | null = null;

  constructor(private readonly stopSettlementTimeoutMs: number) {
    this.completion = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  stopReason(): 'pause' | 'cancel' | null {
    return this.reason;
  }

  async setActiveConversation(
    conversationId: string | null,
    driver: LoopSessionDriver | null
  ): Promise<void> {
    this.activeConversationId = conversationId;
    this.activeDriver = driver;
    if (this.reason && conversationId && driver) {
      await this.cancelActivePrompt(conversationId, driver);
    }
  }

  async request(reason: 'pause' | 'cancel'): Promise<void> {
    if (this.reason !== 'cancel') this.reason = reason;
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(new Error(`Loop ${reason}`));
    }

    if (this.activeConversationId && this.activeDriver) {
      await this.cancelActivePrompt(this.activeConversationId, this.activeDriver);
    }
  }

  private async cancelActivePrompt(
    conversationId: string,
    driver: LoopSessionDriver
  ): Promise<void> {
    try {
      const cancellation = await settleWithin(
        driver.cancelPrompt(conversationId),
        this.stopSettlementTimeoutMs
      );
      if (!cancellation.settled) {
        this.stopFailureMessage = `ACP prompt cancellation did not settle within ${this.stopSettlementTimeoutMs}ms`;
      } else if (!cancellation.value.success) {
        this.stopFailureMessage = cancellation.value.error.message;
      }
    } catch (error) {
      this.stopFailureMessage =
        error instanceof Error ? error.message : 'ACP prompt cancellation failed';
    }
  }

  finish(): void {
    if (this.completed) return;
    this.completed = true;
    this.resolveCompletion();
  }

  async waitForCompletion(): Promise<boolean> {
    return (await settleWithin(this.completion, this.stopSettlementTimeoutMs)).settled;
  }

  stopFailure(): string | null {
    return this.stopFailureMessage;
  }

  recordRunFailure(message: string): void {
    this.stopFailureMessage ??= message;
  }
}

function emitLoop(loop: Loop): void {
  events.emit(loopUpdatedChannel, { loop });
}

function emitPhase(phase: LoopPhase): void {
  events.emit(loopPhaseUpdatedChannel, { loopId: phase.loopId, phase });
}

function notifyAfterLoopCreate(loopId: string, description: string, notify: () => void): void {
  try {
    notify();
  } catch (error) {
    log.warn(`Loop post-create ${description} failed`, {
      loopId,
      error: safeMessage(error, 'Unknown notification error'),
    });
  }
}

function serviceError(error: LoopOperationError): LoopServiceError {
  return error;
}

function planningTarget(target: LoopExecutionTarget) {
  return {
    workspaceId: target.workspaceId,
    path: target.path,
    machine: target.machine,
  };
}

function resolvePlanningConfig(
  config: ReturnType<typeof newLoopConfigV2Schema.parse>,
  result: LoopPlanResult
): Result<ReturnType<typeof newLoopConfigV2Schema.parse>, LoopServiceError> {
  const customCommands = new Map(
    result.customVerifiers.map((verifier) => [verifier.name, verifier.command] as const)
  );
  const verifierPlan: SelectedVerifier[] = (config.verifierPlan ?? []).map((verifier) => {
    if (verifier.kind !== 'custom' || verifier.command) return verifier;
    return { ...verifier, command: customCommands.get(verifier.name) ?? null };
  });
  if (verifierPlan.some((verifier) => verifier.kind === 'custom' && !verifier.command)) {
    return err({
      kind: 'invalid-state',
      message: 'Loop planning did not resolve every selected custom verifier command',
    });
  }
  const validationCommands = Array.from(
    new Set(
      verifierPlan.flatMap((verifier) => {
        if (verifier.kind === 'detected') {
          return verifier.class === 'browser' ? [] : [verifier.command];
        }
        return verifier.command ? [verifier.command] : [];
      })
    )
  );
  if (validationCommands.length === 0) {
    return err({
      kind: 'invalid-state',
      message: 'Loop planning needs at least one selected command-running verifier',
    });
  }
  return ok(newLoopConfigV2Schema.strict().parse({ ...config, verifierPlan, validationCommands }));
}

async function loadLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
  const loop = await getLoopOperation(loopId);
  if (!loop) return err({ kind: 'not-found', message: 'Loop not found' });
  return ok(loop);
}

async function resolveWorkspacePath(taskId: string): Promise<Result<string, LoopServiceError>> {
  const target = await resolveTaskWorkspaceTarget(taskId);
  if (!target.success) {
    return err({ kind: 'workspace-unavailable', message: target.error.message });
  }
  return ok(target.data.path);
}

async function resolveExecutionTarget(
  loop: Loop
): Promise<Result<LoopExecutionTarget, LoopServiceError>> {
  const project = projectManager.getProject(loop.projectId);
  const task = (await getTasks(loop.projectId)).find((candidate) => candidate.id === loop.taskId);
  if (!project || !task) {
    return err({ kind: 'workspace-unavailable', message: 'Loop task or project is unavailable' });
  }

  const settings = await project.settings.get();
  const defaultBranch =
    typeof settings.defaultBranch === 'string'
      ? settings.defaultBranch
      : settings.defaultBranch?.name;
  const target = await resolveLoopExecutionTarget(loop.taskId, {
    taskName: task.name,
    projectPath: project.repoPath,
    defaultBranch,
  });
  if (!target.success) {
    return err({ kind: 'workspace-unavailable', message: target.error.message });
  }
  return target;
}

export class LoopService {
  private readonly activeRuns = new Map<string, LoopRunHandle>();
  private readonly activePreparations = new Map<string, Promise<void>>();
  private enabled = false;
  private readonly runner: PhaseRunner;
  private readonly stopSettlementTimeoutMs: number;

  constructor(options: { stopSettlementTimeoutMs?: number } = {}) {
    this.stopSettlementTimeoutMs =
      options.stopSettlementTimeoutMs ?? DEFAULT_LOOP_STOP_SETTLEMENT_TIMEOUT_MS;
    this.runner = new PhaseRunner({
      onLoopUpdated: emitLoop,
      onPhaseUpdated: emitPhase,
    });
  }

  async initialize(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    const paused = await pauseRunningLoopsForBoot();
    for (const loop of paused) {
      emitLoop(loop);
    }
    const interrupted = await settlePreparingLoopsForBoot();
    for (const loop of interrupted) emitLoop(loop);
  }

  async reconcileEnabledState(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (enabled) return;

    const handles = Array.from(this.activeRuns.entries());
    const stopped = await Promise.all(
      handles.map(([loopId, handle]) => this.stopActiveRun(loopId, handle, 'pause'))
    );
    for (const result of stopped) {
      if (!result.success) log.warn('Loop did not quiesce cleanly during opt-out', result.error);
    }
    const paused = await pauseRunningLoopsForBoot();
    for (const loop of paused) emitLoop(loop);
  }

  private requireEnabled(): Result<void, LoopServiceError> {
    return this.enabled
      ? ok()
      : err({
          kind: 'feature-disabled',
          message: 'ACP Loops are disabled in Experimental Settings',
        });
  }

  async createLoop(params: CreateLoopParams): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const result = await createLoopOperation(params);
    if (!result.success) return err(serviceError(result.error));

    emitLoop(result.data);
    for (const phase of result.data.phases) {
      emitPhase(phase);
    }

    return result;
  }

  async listProjectPlanFiles(
    projectId: string
  ): Promise<Result<WorkspaceFileHit[], LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const project = projectManager.getProject(projectId);
    if (!project) {
      return err({ kind: 'workspace-unavailable', message: 'Project is not mounted' });
    }

    const indexId = `project-plan:${projectId}`;
    try {
      await workspaceFileIndexService.onWorkspaceActivated(indexId, {
        rootPath: project.repoPath,
        enumerate: (rootPath, options) => project.fileSystem.enumerate(rootPath, options),
      });
      return ok(
        workspaceFileIndexService
          .searchFiles(indexId, 'md', 200)
          .filter((file) => /\.md$/i.test(file.path))
          .map((file) => ({ ...file, path: relative(project.repoPath, file.path) }))
      );
    } finally {
      workspaceFileIndexService.onWorkspaceDeactivated(indexId);
    }
  }

  async readProjectPlanFile(
    projectId: string,
    filePath: string,
    _maxBytes?: number
  ): Promise<Result<string, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const project = projectManager.getProject(projectId);
    if (!project) {
      return err({ kind: 'workspace-unavailable', message: 'Project is not mounted' });
    }
    const target = await assertWorkspaceReadAllowed(project.fileSystem, project.repoPath, filePath);
    if (!target.success) {
      return err({ kind: 'invalid-state', message: target.error.message });
    }
    const result = await project.fileSystem.readText(target.data.path, {
      maxBytes: MAX_LOOP_PLAN_SOURCE_BYTES + 1,
    });
    if (!result.success) {
      return err({ kind: 'workspace-unavailable', message: result.error.message });
    }
    if (
      result.data.truncated ||
      result.data.totalSize > MAX_LOOP_PLAN_SOURCE_BYTES ||
      Buffer.byteLength(result.data.content, 'utf8') > MAX_LOOP_PLAN_SOURCE_BYTES
    ) {
      return err({
        kind: 'invalid-state',
        message: `Loop plan input exceeds the ${MAX_LOOP_PLAN_SOURCE_BYTES}-byte limit`,
      });
    }
    return ok(result.data.content);
  }

  async createTaskWithLoop(
    params: CreateTaskWithLoopParams
  ): Promise<Result<CreateTaskWithLoopSuccess, CreateTaskWithLoopError | LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const requestedModel = params.loop.model?.trim() ?? '';
    const models = getPlugin('codex').capabilities.models;
    if (models.kind !== 'selectable' || !Object.hasOwn(models.modelOptions, requestedModel)) {
      return err({
        kind: 'invalid-state',
        message: `Codex model '${requestedModel || '(empty)'}' is not available`,
      });
    }
    const result = await createTaskWithLoopOperation(params);
    if (!result.success) return result;

    if (result.data.loop.status === 'preparing') {
      this.launchPreparation(result.data.loop.id);
    }

    notifyAfterLoopCreate(result.data.loop.id, 'task notification', () => {
      taskService.notifyTaskCreated(result.data.task.task, params.task);
    });
    if (result.data.planningConversation) {
      const planningConversation = result.data.planningConversation;
      notifyAfterLoopCreate(result.data.loop.id, 'conversation notification', () => {
        conversationEvents._emit('conversation:created', planningConversation);
      });
      notifyAfterLoopCreate(result.data.loop.id, 'conversation event', () => {
        events.emit(conversationCreatedChannel, {
          conversation: planningConversation,
        });
      });
    }
    notifyAfterLoopCreate(result.data.loop.id, 'loop event', () => {
      emitLoop(result.data.loop);
    });
    for (const phase of result.data.loop.phases) {
      notifyAfterLoopCreate(result.data.loop.id, 'phase event', () => {
        emitPhase(phase);
      });
    }
    return result;
  }

  async retryLoopPreparation(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    if (this.activePreparations.has(loopId)) {
      return err({ kind: 'conflict', message: 'Loop planning is already running' });
    }
    const retry = await beginLoopPreparationRetry(loopId);
    if (!retry.success) return err(serviceError(retry.error));
    emitLoop(retry.data);
    this.launchPreparation(loopId);
    return retry;
  }

  private launchPreparation(loopId: string): void {
    if (this.activePreparations.has(loopId)) return;
    const preparation = this.prepareLoop(loopId)
      .catch(async (error) => {
        const failed = await failLoopPreparation(
          loopId,
          safeMessage(error, 'Loop planning failed unexpectedly')
        );
        if (failed.success) emitLoop(failed.data);
      })
      .finally(() => {
        if (this.activePreparations.get(loopId) === preparation) {
          this.activePreparations.delete(loopId);
        }
      });
    this.activePreparations.set(loopId, preparation);
  }

  private async prepareLoop(loopId: string): Promise<void> {
    let attempt: LoopSessionAttempt | undefined;
    let state: LoopStateV2 | undefined;
    let target: LoopExecutionTarget | undefined;
    const fail = async (value: unknown): Promise<void> => {
      const message = safeMessage(value, 'Loop planning failed');
      if (attempt && state) {
        const settled: LoopSessionAttempt = {
          ...attempt,
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: message.slice(0, 4_096),
        };
        const progress = await commitSessionAttempt({
          loopId,
          expected: state,
          previous: attempt,
          next: settled,
        });
        if (progress.success) state = progress.data;
      }
      const failed = await failLoopPreparation(loopId, message);
      if (failed.success) emitLoop(failed.data);
    };

    try {
      const loop = await getLoopOperation(loopId);
      const config = newLoopConfigV2Schema.strict().safeParse(loop?.config);
      if (
        !loop ||
        loop.status !== 'preparing' ||
        loop.state?.version !== '2' ||
        !loop.state.preparationConversationId ||
        !loop.state.preparationGoal ||
        !config.success
      ) {
        await fail('Loop planning state is incomplete');
        return;
      }
      const preparationGoal = loop.state.preparationGoal;
      const conversationId = loop.state.preparationConversationId;
      state = loop.state;

      const provisioned = await taskService.provisionWorkspace(loop.taskId);
      if (!provisioned.success) {
        await fail(provisioned.error);
        return;
      }
      const resolvedTarget = await resolveExecutionTarget(loop);
      if (!resolvedTarget.success) {
        await fail(resolvedTarget.error);
        return;
      }
      target = resolvedTarget.data;

      const starting: LoopSessionAttempt = {
        attemptId: randomUUID(),
        conversationId,
        purpose: 'planning',
        target: planningTarget(target),
        status: 'starting',
        startedAt: new Date().toISOString(),
      };
      attempt = starting;
      const appended = await commitSessionAttempt({ loopId, expected: state, next: starting });
      if (!appended.success) {
        await fail(appended.error);
        return;
      }
      state = appended.data;

      const driver = getLoopSessionDriver('acp');
      if (!driver.startPlanningSession || !driver.sendPlanningPrompt) {
        await fail('ACP planning is not available');
        return;
      }
      const session = await driver.startPlanningSession({
        conversationId,
        projectId: loop.projectId,
        taskId: loop.taskId,
        provider: config.data.provider,
        model: config.data.model,
        target: planningTarget(target),
        taskEnvironment: target.taskEnv,
      });
      if (!session.success) {
        await fail(session.error);
        return;
      }

      const running: LoopSessionAttempt = { ...starting, status: 'running' };
      const runningProgress = await commitSessionAttempt({
        loopId,
        expected: state,
        previous: starting,
        next: running,
      });
      if (!runningProgress.success) {
        await fail(runningProgress.error);
        return;
      }
      attempt = running;
      state = runningProgress.data;

      const prompt = await sendPromptWithTimeout({
        driver,
        conversationId,
        prompt: buildLoopPlanPrompt({
          goal: preparationGoal,
          plan: config.data.planSource,
          verifierPlan: config.data.verifierPlan ?? [],
        }),
        timeoutMs: resolvePromptTimeoutMs(DEFAULT_LOOP_PLANNING_TIMEOUT_MS),
        failureMessage: 'Loop planning prompt failed',
        timeoutLabel: 'Loop planning prompt',
        sendPrompt: driver.sendPlanningPrompt.bind(driver),
      });
      if (!prompt.success) {
        await fail(prompt.error);
        return;
      }
      const parsed = parseLoopPlan(prompt.data.finalText);
      if (!parsed.success) {
        await fail(parsed.error.message);
        return;
      }
      const resolvedConfig = resolvePlanningConfig(config.data, parsed.data);
      if (!resolvedConfig.success) {
        await fail(resolvedConfig.error);
        return;
      }

      const completed: LoopSessionAttempt = {
        ...running,
        status: 'completed',
        finishedAt: new Date().toISOString(),
      };
      const completedProgress = await commitSessionAttempt({
        loopId,
        expected: state,
        previous: running,
        next: completed,
      });
      if (!completedProgress.success) {
        await fail(completedProgress.error);
        return;
      }
      state = completedProgress.data;
      attempt = completed;

      const replaced = await replaceLoopPhases(loopId, {
        phases: parsed.data.phases,
        config: resolvedConfig.data,
        acceptanceCriteria: parsed.data.acceptanceCriteria,
      });
      if (!replaced.success) {
        await fail(replaced.error);
        return;
      }
      emitLoop(replaced.data);
      for (const phase of replaced.data.phases) emitPhase(phase);
    } finally {
      target?.dispose();
    }
  }

  async getLoopsForProject(projectId: string): Promise<Result<LoopWithPhases[], LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    return ok(await getLoopsForProjectOperation(projectId));
  }

  async getLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    return loadLoop(loopId);
  }

  async getVerifierAvailability(
    taskId: string
  ): Promise<Result<LoopVerifierAvailability[], LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const cwd = await resolveWorkspacePath(taskId);
    if (!cwd.success) {
      return ok(
        VERIFIER_IDS.map((id) => {
          const verifier = getVerifier(id);
          return {
            id,
            label: verifier?.label ?? 'Native Browser Preview',
            available: false,
            reason:
              id === 'agent-browser'
                ? 'Browser verification is provided by the v2 clean-room E2E gate'
                : cwd.error.message,
          };
        })
      );
    }

    return ok(await this.checkVerifierAvailability(cwd.data));
  }

  async detectVerifiers(
    params: DetectVerifiersParams
  ): Promise<Result<DetectVerifiersResult, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    const project = projectManager.getProject(params.projectId);
    if (!project) {
      return err({
        kind: 'workspace-unavailable',
        message: `Project is not open: ${params.projectId}`,
      });
    }

    const browserLabel = params.provider === 'codex' ? 'Codex computer use' : 'Claude computer use';
    const [verifiers, availability] = await Promise.all([
      detectRepoVerifiers(project.fileSystem, project.repoPath, params.provider),
      this.checkVerifierAvailability(project.repoPath, browserLabel),
    ]);
    return ok({ verifiers, availability });
  }

  private async checkVerifierAvailability(
    cwd: string,
    browserLabel = 'Native Browser Preview'
  ): Promise<LoopVerifierAvailability[]> {
    return await Promise.all(
      VERIFIER_IDS.map(async (id) => {
        const verifier = getVerifier(id);
        if (!verifier) {
          return {
            id,
            label: browserLabel,
            available: false,
            reason: 'Browser verification is provided by the v2 clean-room E2E gate',
          };
        }
        const result = await verifier.checkAvailability(cwd);
        return {
          id,
          label: verifier.label,
          available: result.success ? result.data.available : false,
          reason: result.success ? result.data.message : result.error.message,
        };
      })
    );
  }

  async startLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    return this.startOrResume(loopId, 'start', (loop) => {
      const runnable = assertLoopRunnable(loop);
      if (!runnable.success) return err(serviceError(runnable.error));
      return ['draft', 'paused', 'failed'].includes(loop.status)
        ? ok()
        : err({
            kind: 'invalid-state',
            message: `Cannot start loop with status '${loop.status}'`,
          });
    });
  }

  async resumeLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    return this.startOrResume(loopId, 'resume', (loop) => {
      if (loop.status !== 'paused') {
        return err({
          kind: 'invalid-state',
          message: `Cannot resume loop with status '${loop.status}'`,
        });
      }
      const runnable = assertLoopRunnable(loop);
      return runnable.success ? ok() : err(serviceError(runnable.error));
    });
  }

  async pauseLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const handle = this.activeRuns.get(loopId);
    if (handle) {
      const stopped = await this.stopActiveRun(loopId, handle, 'pause');
      if (!stopped.success) return stopped;
    }

    const updated = await updateLoop(loopId, { status: 'paused' });
    if (!updated.success) return err(serviceError(updated.error));
    emitLoop(updated.data);

    return loadLoop(loopId);
  }

  async cancelLoop(loopId: string): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const handle = this.activeRuns.get(loopId);
    if (handle) {
      const stopped = await this.stopActiveRun(loopId, handle, 'cancel');
      if (!stopped.success) return stopped;
      if (handle.currentPhaseId) {
        const phase = await updatePhase(handle.currentPhaseId, {
          status: 'failed',
          lastError: 'Loop cancelled',
        });
        if (phase.success) emitPhase(phase.data);
      }
    }

    const updated = await updateLoop(loopId, { status: 'failed' });
    if (!updated.success) return err(serviceError(updated.error));
    emitLoop(updated.data);

    return loadLoop(loopId);
  }

  async retryPhase(
    loopId: string,
    phaseId: string
  ): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    if (this.activeRuns.has(loopId)) {
      return err({ kind: 'conflict', message: 'Cannot retry a phase while the loop is running' });
    }

    const loopResult = await loadLoop(loopId);
    if (!loopResult.success) return loopResult;

    const phase = loopResult.data.phases.find((candidate) => candidate.id === phaseId);
    if (!phase) return err({ kind: 'not-found', message: 'Loop phase not found' });

    const reset = await resetPhaseForRetry(phaseId);
    if (!reset.success) return err(serviceError(reset.error));
    emitPhase(reset.data);

    const updated = await updateLoop(loopId, {
      status: 'paused',
      currentPhaseIndex: phase.idx,
    });
    if (!updated.success) return err(serviceError(updated.error));
    emitLoop(updated.data);

    return loadLoop(loopId);
  }

  async deleteLoop(loopId: string): Promise<Result<void, LoopServiceError>> {
    const handle = this.activeRuns.get(loopId);
    if (handle) {
      const stopped = await this.stopActiveRun(loopId, handle, 'cancel');
      if (!stopped.success) return stopped;
    }

    const result = await deleteLoopOperation(loopId);
    if (!result.success) return err(serviceError(result.error));
    return ok();
  }

  private async startOrResume(
    loopId: string,
    action: 'start' | 'resume',
    validate: (loop: LoopWithPhases) => Result<void, LoopServiceError>
  ): Promise<Result<LoopWithPhases, LoopServiceError>> {
    const enabled = this.requireEnabled();
    if (!enabled.success) return enabled;
    if (this.activeRuns.has(loopId)) {
      return err({ kind: 'conflict', message: 'Loop is already running' });
    }

    const handle = new LoopRunHandle(this.stopSettlementTimeoutMs);
    this.activeRuns.set(loopId, handle);
    let executionTarget: LoopExecutionTarget | undefined;
    let launched = false;

    try {
      const stopped = this.preLaunchStop(handle, action);
      if (stopped) return stopped;

      const loopResult = await loadLoop(loopId);
      if (!loopResult.success) return loopResult;
      const stoppedAfterLoad = this.preLaunchStop(handle, action);
      if (stoppedAfterLoad) return stoppedAfterLoad;

      const valid = validate(loopResult.data);
      if (!valid.success) return valid;

      const resolvedTarget = await resolveExecutionTarget(loopResult.data);
      if (!resolvedTarget.success) return resolvedTarget;
      executionTarget = resolvedTarget.data;
      const stoppedAfterTarget = this.preLaunchStop(handle, action);
      if (stoppedAfterTarget) return stoppedAfterTarget;

      const checkpoint = await this.initializeCheckpointAuthority(loopResult.data, executionTarget);
      if (!checkpoint.success) return checkpoint;
      const stoppedAfterCheckpoint = this.preLaunchStop(handle, action);
      if (stoppedAfterCheckpoint) return stoppedAfterCheckpoint;

      const running = await updateLoop(loopId, { status: 'running' });
      if (!running.success) return err(serviceError(running.error));
      const stoppedAfterTransition = this.preLaunchStop(handle, action);
      if (stoppedAfterTransition) {
        await updateLoop(loopId, { status: 'paused' });
        return stoppedAfterTransition;
      }
      emitLoop(running.data);

      const ownedTarget = executionTarget;
      launched = true;
      void this.runLoop(loopId, ownedTarget, handle).finally(() => {
        ownedTarget.dispose();
        if (this.activeRuns.get(loopId) === handle) this.activeRuns.delete(loopId);
        handle.finish();
      });

      return loadLoop(loopId);
    } finally {
      if (!launched) {
        executionTarget?.dispose();
        if (this.activeRuns.get(loopId) === handle) this.activeRuns.delete(loopId);
        handle.finish();
      }
    }
  }

  private async stopActiveRun(
    loopId: string,
    handle: LoopRunHandle,
    reason: 'pause' | 'cancel'
  ): Promise<Result<void, LoopServiceError>> {
    await handle.request(reason);
    const settled = await handle.waitForCompletion();
    const cancellationFailure = handle.stopFailure();
    if (settled && !cancellationFailure) return ok();

    const message = cancellationFailure
      ? `Loop ${reason} failed: ${cancellationFailure}`
      : `Loop ${reason} did not settle within ${this.stopSettlementTimeoutMs}ms`;
    const failed = await updateLoop(loopId, { status: 'failed' });
    if (failed.success) emitLoop(failed.data);
    return err({ kind: 'run-failed', message });
  }

  private preLaunchStop(
    handle: LoopRunHandle,
    action: 'start' | 'resume'
  ): Result<never, LoopServiceError> | null {
    if (!this.enabled) {
      return err({
        kind: 'feature-disabled',
        message: 'ACP Loops are disabled in Experimental Settings',
      });
    }
    const reason = handle.stopReason();
    if (!reason) return null;
    return err({
      kind: 'invalid-state',
      message: `Loop ${action} was ${reason === 'pause' ? 'paused' : 'cancelled'}`,
    });
  }

  private async initializeCheckpointAuthority(
    loop: LoopWithPhases,
    target: LoopExecutionTarget
  ): Promise<Result<void, LoopServiceError>> {
    if (loop.config?.version !== '2' || loop.state?.version !== '2') return ok();
    try {
      const head = (
        await runLoopCommand(target, 'git', ['rev-parse', 'HEAD'], { timeoutMs: 60_000 })
      ).stdout.trim();
      const expected = loop.state.checkpointCommit;
      if (expected && expected !== head) {
        return err({
          kind: 'invalid-state',
          message: `Loop checkpoint drift: expected ${expected}, observed ${head}`,
        });
      }
      if (!loop.state.baseCommit) {
        const initialized = await updateLoop(loop.id, {
          state: {
            ...loop.state,
            baseCommit: head,
            expectedFeatureHead: head,
            checkpointCommit: head,
          },
        });
        if (!initialized.success) return err(serviceError(initialized.error));
        emitLoop(initialized.data);
      }
      return ok();
    } catch (error) {
      return err({
        kind: 'workspace-unavailable',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runLoop(
    loopId: string,
    executionTarget: LoopExecutionTarget,
    handle: LoopRunHandle
  ): Promise<void> {
    try {
      const driver = getLoopSessionDriver('acp');

      while (!handle.stopReason()) {
        const loop = await getLoopOperation(loopId);
        if (!loop) return;
        if (loop.status !== 'running') return;

        if (loop.phases.length === 0) {
          const failed = await updateLoop(loopId, { status: 'failed' });
          if (failed.success) emitLoop(failed.data);
          handle.recordRunFailure('A running Loop cannot have zero phases');
          return;
        }

        const phase = loop.phases.find((candidate) => candidate.idx === loop.currentPhaseIndex);
        if (!phase) {
          const completed = await updateLoop(loopId, { status: 'completed' });
          if (completed.success) emitLoop(completed.data);
          return;
        }

        if (phase.status === 'passed') {
          const next = await updateLoop(loopId, { currentPhaseIndex: phase.idx + 1 });
          if (next.success) emitLoop(next.data);
          continue;
        }

        handle.currentPhaseId = phase.id;
        const current = await updateLoop(loopId, { currentPhaseIndex: phase.idx });
        if (current.success) emitLoop(current.data);

        const result = await this.runner.runPhase({
          loop,
          phase,
          executionTarget,
          driver,
          control: handle,
        });

        if (!result.success) {
          const failed = await updateLoop(loopId, { status: 'failed' });
          if (failed.success) emitLoop(failed.data);
          handle.recordRunFailure(result.error.message);
          log.warn('Loop run failed', { loopId, error: result.error.message });
          return;
        }

        if (result.data.kind === 'passed') {
          const next = await updateLoop(loopId, { currentPhaseIndex: phase.idx + 1 });
          if (next.success) emitLoop(next.data);
          continue;
        }

        if (result.data.kind === 'failed' || result.data.kind === 'paused') return;
        if (result.data.kind === 'cancelled') return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await updateLoop(loopId, { status: 'failed' });
      if (failed.success) emitLoop(failed.data);
      handle.recordRunFailure(message);
      log.error('Loop run threw unexpectedly', {
        loopId,
        error: message,
      });
    }
  }
}

export const loopService = new LoopService();
