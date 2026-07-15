import { appSettingsService } from '@main/core/settings/settings-service';
import type { AgentProviderId } from '@shared/core/agents/agent-provider-registry';
import { AcpLoopDriver } from './drivers/acp-driver';
import { LoopService } from './loop-service';
import {
  createLoop,
  getLoop,
  getLoopByTask,
  listLoops,
  updateLoop,
  updatePhase,
} from './operations/loop-operations';
import { resolveLoopExecutionTarget } from './runtime/loop-execution-target';
import { getVerifier } from './verifiers/registry';

/**
 * Production `loopService` singleton, wiring the real ACP driver, verifier
 * registry, settings, and DB operations into the pure `LoopService`. Kept separate
 * from `loop-service.ts` (mirroring `production-acp-session-manager.ts`) so the
 * class stays importable in unit tests without pulling in Electron/db side effects.
 */
export const loopService = new LoopService({
  ops: { createLoop, getLoop, getLoopByTask, listLoops, updateLoop, updatePhase },
  driverFor: (config) =>
    new AcpLoopDriver({
      provider: config.provider as AgentProviderId,
      ...(config.model ? { model: config.model } : {}),
    }),
  getVerifier,
  getMaxAttempts: async () => {
    const tasks = await appSettingsService.get('tasks');
    return tasks.maxLoopAttempts ?? 3;
  },
  resolveVerifierContext: async (taskId) => {
    const target = await resolveLoopExecutionTarget(taskId);
    return { ctx: target.ctx, cwd: target.path };
  },
});
