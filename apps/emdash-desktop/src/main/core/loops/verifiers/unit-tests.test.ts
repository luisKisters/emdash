import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { getVerifier } from './registry';
import { createUnitTestsVerifier } from './unit-tests';

describe('unit-tests verifier', () => {
  let dir: string;
  let ctx: LocalExecutionContext;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'loop-unit-'));
    ctx = new LocalExecutionContext({ root: dir });
  });

  afterEach(async () => {
    ctx.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  const input = () => ({ taskId: 't1', ctx, cwd: dir, signal: new AbortController().signal });

  it('is always available in the registry', () => {
    expect(getVerifier('unit-tests')?.id).toBe('unit-tests');
  });

  it('passes when the test command exits 0', async () => {
    const verifier = createUnitTestsVerifier({ command: 'exit 0' });
    const result = await verifier.run(input());
    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('fails when the test command exits non-zero', async () => {
    const verifier = createUnitTestsVerifier({ command: 'exit 1' });
    const result = await verifier.run(input());
    expect(result.ok).toBe(false);
  });

  it('fails when the test command times out', async () => {
    const verifier = createUnitTestsVerifier({ command: 'sleep 5', timeoutMs: 50 });
    const result = await verifier.run(input());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('timed out');
  });
});
