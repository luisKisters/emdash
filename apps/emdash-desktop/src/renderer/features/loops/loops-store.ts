import { makeAutoObservable, runInAction } from 'mobx';
import { events, rpc } from '@renderer/lib/ipc';
import { loopProgressChannel, loopUpdatedChannel } from '@shared/events/loopEvents';
import type { Loop } from '@shared/core/loops/loops';

/**
 * Observes a single task's loop. Subscribes to the loop update/progress channels,
 * ignores events for other tasks, and exposes derived control flags + rpc actions.
 */
export class LoopsStore {
  loop: Loop | null = null;
  private _unsubs: Array<() => void> = [];

  constructor(private readonly taskId: string) {
    const apply = (loop: Loop) => {
      if (loop.taskId !== this.taskId) return;
      runInAction(() => {
        this.loop = loop;
      });
    };
    this._unsubs.push(events.on(loopUpdatedChannel, apply));
    this._unsubs.push(events.on(loopProgressChannel, apply));
    makeAutoObservable(this);
  }

  get isRunning(): boolean {
    return this.loop?.status === 'running';
  }

  get canPause(): boolean {
    return this.loop?.status === 'running';
  }

  get canResume(): boolean {
    return this.loop?.status === 'paused';
  }

  get canRetry(): boolean {
    return this.loop?.status === 'paused' || this.loop?.status === 'failed';
  }

  async load(): Promise<void> {
    const loop = await rpc.loops.getLoopByTask(this.taskId);
    runInAction(() => {
      this.loop = loop;
    });
  }

  pause(): void {
    if (this.loop) void rpc.loops.pause(this.loop.id);
  }

  resume(): void {
    if (this.loop) void rpc.loops.resume(this.loop.id);
  }

  cancel(): void {
    if (this.loop) void rpc.loops.cancel(this.loop.id);
  }

  retry(): void {
    if (this.loop) void rpc.loops.retry(this.loop.id);
  }

  dispose(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
