import { appSettingsService } from '@main/core/settings/settings-service';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import type { Loop } from '@shared/core/loops/loops';
import { createRPCController } from '@shared/lib/ipc/rpc';
import type { CreateLoopInput } from './operations/loop-operations';
import { loopService } from './production-loop-service';

/** Rejects a mutating loop call when the `experiments.loops` flag is off. */
async function assertLoopsEnabled(): Promise<void> {
  const experiments = await appSettingsService.get('experiments');
  if (!experiments.loops) {
    throw new Error('Loops are disabled (experiments.loops is off).');
  }
}

export const loopsController = createRPCController({
  create: async (args: {
    taskId: string;
    phases: CreateLoopInput['phases'];
    config: LoopConfig;
  }): Promise<Loop> => {
    await assertLoopsEnabled();
    return loopService.create(args.taskId, args.phases, args.config);
  },

  start: async (loopId: string): Promise<void> => {
    await assertLoopsEnabled();
    await loopService.start(loopId);
  },

  pause: async (loopId: string): Promise<void> => {
    await assertLoopsEnabled();
    await loopService.pause(loopId);
  },

  resume: async (loopId: string): Promise<void> => {
    await assertLoopsEnabled();
    await loopService.resume(loopId);
  },

  cancel: async (loopId: string): Promise<void> => {
    await assertLoopsEnabled();
    await loopService.cancel(loopId);
  },

  retry: async (loopId: string): Promise<void> => {
    await assertLoopsEnabled();
    await loopService.retry(loopId);
  },

  getLoop: (loopId: string): Promise<Loop | null> => loopService.getLoop(loopId),

  getLoopByTask: (taskId: string): Promise<Loop | null> => loopService.getLoopByTask(taskId),

  listLoops: (): Promise<Loop[]> => loopService.listLoops(),
});
