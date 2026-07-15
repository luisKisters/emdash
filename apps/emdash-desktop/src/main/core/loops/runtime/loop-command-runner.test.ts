import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { runCommand } from './loop-command-runner';

describe('runCommand', () => {
  let dir: string;
  let ctx: LocalExecutionContext;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'loop-cmd-'));
    ctx = new LocalExecutionContext({ root: dir });
  });

  afterEach(async () => {
    ctx.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it('reports exit 0 and stdout on success', async () => {
    const result = await runCommand(ctx, 'printf hello');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('hello');
  });

  it('reports a non-zero exit code without throwing', async () => {
    const result = await runCommand(ctx, 'exit 7');
    expect(result.exitCode).toBe(7);
    expect(result.timedOut).toBe(false);
  });

  it('flags a timed-out command', async () => {
    const result = await runCommand(ctx, 'sleep 5', { timeoutMs: 50 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('rethrows on abort', async () => {
    const controller = new AbortController();
    const promise = runCommand(ctx, 'sleep 5', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});
