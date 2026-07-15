import { err, ok } from '@emdash/shared';
import { describe, expect, it, vi } from 'vitest';
import type { LoopGithubContext } from '../github/loop-github-context';
import { createGithubVerifier, type GithubVerifierDeps } from './github';
import type { VerifierRunInput } from './types';

const CONNECTED: LoopGithubContext = {
  projectId: 'p1',
  accountId: 'acct-1',
  host: 'github.com',
  nameWithOwner: 'acme/widget',
  repositoryUrl: 'https://github.com/acme/widget',
  branch: 'feature/x',
  prNumber: 7,
  prUrl: 'https://github.com/acme/widget/pull/7',
  headRefOid: 'abc123',
  token: 'ghp_secret',
  authContext: { accountId: 'acct-1' },
};

const input = { taskId: 't1', signal: new AbortController().signal } as unknown as VerifierRunInput;

function makeDeps(overrides: Partial<GithubVerifierDeps> = {}): GithubVerifierDeps {
  return {
    resolveContext: async () => CONNECTED,
    syncChecks: async () => ok(false),
    loadChecks: async () => [{ name: 'build', conclusion: 'SUCCESS' }],
    ...overrides,
  };
}

describe('github verifier', () => {
  it('passes when all checks are complete and green', async () => {
    const result = await createGithubVerifier(makeDeps()).run(input);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('fails when a check actually failed', async () => {
    const result = await createGithubVerifier(
      makeDeps({
        loadChecks: async () => [
          { name: 'build', conclusion: 'SUCCESS' },
          { name: 'test', conclusion: 'FAILURE' },
        ],
      })
    ).run(input);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('test');
  });

  it('skips (non-blocking) when there is no connected account', async () => {
    const result = await createGithubVerifier(
      makeDeps({ resolveContext: async () => ({ ...CONNECTED, accountId: null }) })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
  });

  it('skips when there is no PR for the branch', async () => {
    const result = await createGithubVerifier(
      makeDeps({
        resolveContext: async () => ({ ...CONNECTED, prUrl: null, headRefOid: null }),
      })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
  });

  it('skips when checks are still running', async () => {
    const result = await createGithubVerifier(makeDeps({ syncChecks: async () => ok(true) })).run(
      input
    );
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(result.output).toContain('running');
  });

  it('skips when the sync itself fails (best-effort)', async () => {
    const result = await createGithubVerifier(
      makeDeps({ syncChecks: async () => err({ type: 'api_error' } as never) })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
  });

  it('does not call syncChecks when the context is not connected', async () => {
    const syncChecks = vi.fn();
    await createGithubVerifier(
      makeDeps({ resolveContext: async () => ({ ...CONNECTED, prUrl: null }), syncChecks })
    ).run(input);
    expect(syncChecks).not.toHaveBeenCalled();
  });
});
