import { isOk, type Result } from '@emdash/shared';
import { eq } from 'drizzle-orm';
import type { GitHubApiAuthContext } from '@main/core/github/services/github-api-auth-service';
import type { PrSyncEngineError } from '@main/core/pull-requests/pr-sync-errors';
import { resolveLoopGithubContext } from '../github/loop-github-context';
import type { Verifier } from './types';

/** Check conclusions that count as a real failure of the PR's CI. */
const FAILING_CONCLUSIONS = new Set([
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
]);

interface CheckRow {
  name: string;
  conclusion: string;
}

/** Injected seam so the verifier is testable without a real DB or GitHub. */
export interface GithubVerifierDeps {
  resolveContext: typeof resolveLoopGithubContext;
  syncChecks(
    prUrl: string,
    headRefOid: string,
    authContext: GitHubApiAuthContext
  ): Promise<Result<boolean, PrSyncEngineError>>;
  loadChecks(prUrl: string): Promise<CheckRow[]>;
}

// The real deps pull in the Electron-bound DB client + PR sync engine, so they are
// imported lazily to keep the verifier registry importable in the `node` test project.
const defaultDeps: GithubVerifierDeps = {
  resolveContext: resolveLoopGithubContext,
  async syncChecks(prUrl, headRefOid, authContext) {
    const { prSyncEngine } = await import('@main/core/pull-requests/pr-sync-engine');
    return prSyncEngine.syncChecks(prUrl, headRefOid, authContext);
  },
  async loadChecks(prUrl) {
    const { db } = await import('@main/db/client');
    const { pullRequestChecks } = await import('@main/db/schema');
    return db
      .select({ name: pullRequestChecks.name, conclusion: pullRequestChecks.conclusion })
      .from(pullRequestChecks)
      .where(eq(pullRequestChecks.pullRequestUrl, prUrl));
  },
};

/**
 * Optional verifier: reads PR CI status for the task's branch/PR through emdash's
 * connected GitHub account (`prSyncEngine.syncChecks`). Passes when checks are
 * complete and none failed; returns a non-blocking skip when there is no connected
 * account, no PR, or checks are still running; fails only when a check actually failed.
 * Never shells out to the `gh` CLI.
 */
export function createGithubVerifier(deps: GithubVerifierDeps = defaultDeps): Verifier {
  return {
    id: 'github',
    async run(input) {
      const ctx = await deps.resolveContext(input.taskId);
      if (!ctx.accountId || !ctx.prUrl || !ctx.headRefOid) {
        return { ok: true, skipped: true, output: 'no connected GitHub account or PR' };
      }

      const sync = await deps.syncChecks(ctx.prUrl, ctx.headRefOid, ctx.authContext ?? {});
      if (!isOk(sync)) {
        return { ok: true, skipped: true, output: `unable to sync checks: ${sync.error.type}` };
      }

      const checks = await deps.loadChecks(ctx.prUrl);
      if (checks.length === 0) {
        return { ok: true, skipped: true, output: 'no GitHub checks reported' };
      }

      const failed = checks.filter((c) => FAILING_CONCLUSIONS.has(c.conclusion));
      if (failed.length > 0) {
        return {
          ok: false,
          output: `GitHub checks failed: ${failed.map((c) => c.name).join(', ')}`,
        };
      }

      // `syncChecks` returns true when a check is still running.
      if (sync.data) {
        return { ok: true, skipped: true, output: 'GitHub checks still running' };
      }

      return { ok: true, output: 'all GitHub checks passed' };
    },
  };
}
