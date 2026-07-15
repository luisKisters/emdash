import type { IExecutionContext } from '@main/core/execution-context/types';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import type { Loop, LoopPhase, LoopStatus } from '@shared/core/loops/loops';
import type { LoopSessionDriver } from './drivers/session-driver';
import type { CreateLoopInput } from './operations/loop-operations';
import { runPhase } from './phase-runner';
import type { Verifier } from './verifiers/types';

/** DB operations the service depends on — injected so it stays testable without SQLite. */
export interface LoopOps {
  createLoop(input: CreateLoopInput): Promise<Loop>;
  getLoop(id: string): Promise<Loop | null>;
  getLoopByTask(taskId: string): Promise<Loop | null>;
  listLoops(): Promise<Loop[]>;
  updateLoop(
    id: string,
    patch: Partial<Pick<Loop, 'status' | 'currentPhaseIndex' | 'config'>>
  ): Promise<Loop | null>;
  updatePhase(
    phaseId: string,
    patch: Partial<Pick<LoopPhase, 'status' | 'attempts'>>
  ): Promise<LoopPhase | null>;
}

export interface LoopServiceDeps {
  ops: LoopOps;
  /** Builds the driver for a run from the loop's config (provider/model). */
  driverFor(config: LoopConfig): LoopSessionDriver;
  getVerifier(id: LoopPhase['checks'][number]): Verifier | undefined;
  getMaxAttempts(): Promise<number>;
  resolveVerifierContext(taskId: string): Promise<{ ctx: IExecutionContext; cwd: string }>;
  /** Optional progress sink; the real event emit is wired by the RPC/events task. */
  emit?(loop: Loop): void;
}

function summarizePhase(phase: LoopPhase): string {
  return `Prior phase "${phase.name}" ${phase.status} after ${phase.attempts} attempt(s).`;
}

/**
 * Singleton orchestrator for loops. Walks a loop's phases one at a time via the
 * `phase-runner`, advancing on pass, pausing the loop on a phase failure, and
 * completing when every phase passes. All external seams (driver, verifiers,
 * execution context, DB ops) are injected so the happy path is unit-testable with
 * fakes.
 */
export class LoopService {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly deps: LoopServiceDeps) {}

  async create(
    taskId: string,
    phases: CreateLoopInput['phases'],
    config: LoopConfig
  ): Promise<Loop> {
    return this.deps.ops.createLoop({ taskId, config, phases });
  }

  /**
   * Starts (or resumes) a loop, walking phases from `currentPhaseIndex`. The
   * returned promise settles when the run reaches a terminal/paused state; callers
   * that want fire-and-forget behavior should not await it.
   */
  async start(loopId: string): Promise<void> {
    if (this.controllers.has(loopId)) return;
    const loop = await this.deps.ops.getLoop(loopId);
    if (!loop) throw new Error(`Loop not found: ${loopId}`);
    await this.setStatus(loopId, 'running');
    await this.run(loopId, loop.config);
  }

  async pause(loopId: string): Promise<void> {
    this.controllers.get(loopId)?.abort();
    await this.setStatus(loopId, 'paused');
  }

  async resume(loopId: string): Promise<void> {
    await this.start(loopId);
  }

  async cancel(loopId: string): Promise<void> {
    this.controllers.get(loopId)?.abort();
    await this.setStatus(loopId, 'failed');
  }

  async retry(loopId: string): Promise<void> {
    const loop = await this.deps.ops.getLoop(loopId);
    if (!loop) throw new Error(`Loop not found: ${loopId}`);
    const phase = loop.phases[loop.currentPhaseIndex];
    if (phase && phase.status === 'failed') {
      await this.deps.ops.updatePhase(phase.id, { status: 'pending', attempts: 0 });
    }
    await this.start(loopId);
  }

  /** Marks any loop left `running` at boot as `paused` (crash-resume). */
  async pauseRunningLoopsForBoot(): Promise<void> {
    const all = await this.deps.ops.listLoops();
    for (const loop of all) {
      if (loop.status === 'running') {
        await this.deps.ops.updateLoop(loop.id, { status: 'paused' });
      }
    }
  }

  async initialize(): Promise<void> {
    await this.pauseRunningLoopsForBoot();
  }

  private async run(loopId: string, config: LoopConfig): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(loopId, controller);
    try {
      let loop = await this.deps.ops.getLoop(loopId);
      if (!loop) return;
      const driver = this.deps.driverFor(config);
      const maxAttempts = await this.deps.getMaxAttempts();
      const vctx = await this.deps.resolveVerifierContext(loop.taskId);
      try {
        while (loop && loop.currentPhaseIndex < loop.phases.length) {
          if (controller.signal.aborted) return;
          const idx = loop.currentPhaseIndex;
          const priorSummary = idx > 0 ? summarizePhase(loop.phases[idx - 1]!) : undefined;
          const result = await runPhase(
            {
              updatePhase: this.deps.ops.updatePhase,
              driver,
              getVerifier: this.deps.getVerifier,
              maxAttempts,
              verifierContext: vctx,
              ...(priorSummary ? { priorSummary } : {}),
            },
            loop,
            idx,
            controller.signal
          );
          this.emit(await this.deps.ops.getLoop(loopId));
          if (result.status === 'failed') {
            await this.setStatus(loopId, 'paused');
            return;
          }
          loop = await this.deps.ops.updateLoop(loopId, { currentPhaseIndex: idx + 1 });
        }
        await this.setStatus(loopId, 'completed');
      } finally {
        vctx.ctx.dispose();
      }
    } catch {
      // An abort (pause/cancel) already set the terminal status; only surface
      // genuine failures.
      if (!controller.signal.aborted) await this.setStatus(loopId, 'failed');
    } finally {
      this.controllers.delete(loopId);
    }
  }

  private async setStatus(loopId: string, status: LoopStatus): Promise<Loop | null> {
    const loop = await this.deps.ops.updateLoop(loopId, { status });
    this.emit(loop);
    return loop;
  }

  private emit(loop: Loop | null): void {
    if (loop) this.deps.emit?.(loop);
  }
}
