import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopConfig } from '@shared/core/loops/loop-config';
import { loopsController } from './controller';
import { loopService } from './production-loop-service';

const settingsMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@main/core/settings/settings-service', () => ({
  appSettingsService: { get: settingsMocks.get },
}));

vi.mock('./production-loop-service', () => ({
  loopService: {
    create: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    getLoop: vi.fn(),
    getLoopByTask: vi.fn(),
    listLoops: vi.fn(),
  },
}));

const config: LoopConfig = { version: '1', provider: 'claude', model: 'test-model' };

function enableLoops(enabled: boolean): void {
  settingsMocks.get.mockResolvedValue({ loops: enabled });
}

describe('loopsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableLoops(true);
  });

  it('delegates create to loopService', async () => {
    vi.mocked(loopService.create).mockResolvedValue({ id: 'l1' } as never);
    const phases = [{ name: 'p1', goal: 'g', checks: ['unit-tests' as const] }];
    await loopsController.create({ taskId: 't1', phases, config });
    expect(loopService.create).toHaveBeenCalledWith('t1', phases, config);
  });

  it('delegates lifecycle methods to loopService', async () => {
    await loopsController.start('l1');
    await loopsController.pause('l1');
    await loopsController.resume('l1');
    await loopsController.cancel('l1');
    await loopsController.retry('l1');
    expect(loopService.start).toHaveBeenCalledWith('l1');
    expect(loopService.pause).toHaveBeenCalledWith('l1');
    expect(loopService.resume).toHaveBeenCalledWith('l1');
    expect(loopService.cancel).toHaveBeenCalledWith('l1');
    expect(loopService.retry).toHaveBeenCalledWith('l1');
  });

  it('delegates read methods without gating on the flag', async () => {
    enableLoops(false);
    await loopsController.getLoop('l1');
    await loopsController.getLoopByTask('t1');
    await loopsController.listLoops();
    expect(loopService.getLoop).toHaveBeenCalledWith('l1');
    expect(loopService.getLoopByTask).toHaveBeenCalledWith('t1');
    expect(loopService.listLoops).toHaveBeenCalled();
  });

  it('rejects mutating calls when experiments.loops is off', async () => {
    enableLoops(false);
    await expect(loopsController.create({ taskId: 't1', phases: [], config })).rejects.toThrow();
    await expect(loopsController.start('l1')).rejects.toThrow();
    await expect(loopsController.pause('l1')).rejects.toThrow();
    await expect(loopsController.resume('l1')).rejects.toThrow();
    await expect(loopsController.cancel('l1')).rejects.toThrow();
    await expect(loopsController.retry('l1')).rejects.toThrow();
    expect(loopService.create).not.toHaveBeenCalled();
    expect(loopService.start).not.toHaveBeenCalled();
  });
});
