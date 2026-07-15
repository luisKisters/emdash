import { err, ok } from '@emdash/shared';
import { describe, expect, it } from 'vitest';
import type { ProjectPullRequestContext } from '@main/core/pull-requests/project-pull-request-context';
import {
  resolveLoopGithubContext,
  toGithubFacts,
  type LoopGithubContextDeps,
} from './loop-github-context';

const PROJECT_CONTEXT: ProjectPullRequestContext = {
  projectId: 'p1',
  repositoryUrl: 'https://github.com/acme/widget',
  host: 'github.com',
  nameWithOwner: 'acme/widget',
  authContext: { accountId: 'acct-1' },
};

function makeDeps(overrides: Partial<LoopGithubContextDeps> = {}): LoopGithubContextDeps {
  return {
    loadTask: async () => ({ projectId: 'p1', workspaceId: 'w1' }),
    loadBranch: async () => 'feature/x',
    resolveProjectContext: async () => ok(PROJECT_CONTEXT),
    loadPullRequest: async () => ({
      url: 'https://github.com/acme/widget/pull/7',
      identifier: '#7',
      headRefOid: 'abc123',
    }),
    getToken: async () => ok('ghp_secret'),
    ...overrides,
  };
}

describe('resolveLoopGithubContext', () => {
  it('resolves full repo/PR facts and a token when everything is connected', async () => {
    const ctx = await resolveLoopGithubContext('t1', makeDeps());
    expect(ctx).toMatchObject({
      projectId: 'p1',
      accountId: 'acct-1',
      host: 'github.com',
      nameWithOwner: 'acme/widget',
      branch: 'feature/x',
      prNumber: 7,
      prUrl: 'https://github.com/acme/widget/pull/7',
      headRefOid: 'abc123',
      token: 'ghp_secret',
    });
  });

  it('degrades to nulls when the task has no GitHub account/remote', async () => {
    const ctx = await resolveLoopGithubContext(
      't1',
      makeDeps({
        resolveProjectContext: async () =>
          err({ type: 'github_no_account_selected', message: 'none' }),
      })
    );
    expect(ctx.projectId).toBe('p1');
    expect(ctx.branch).toBe('feature/x');
    expect(ctx.accountId).toBeNull();
    expect(ctx.nameWithOwner).toBeNull();
    expect(ctx.prUrl).toBeNull();
    expect(ctx.token).toBeNull();
  });

  it('leaves PR fields null when no PR exists for the branch', async () => {
    const ctx = await resolveLoopGithubContext(
      't1',
      makeDeps({ loadPullRequest: async () => null })
    );
    expect(ctx.nameWithOwner).toBe('acme/widget');
    expect(ctx.prNumber).toBeNull();
    expect(ctx.prUrl).toBeNull();
    expect(ctx.headRefOid).toBeNull();
  });

  it('leaves the token null when token resolution fails', async () => {
    const ctx = await resolveLoopGithubContext(
      't1',
      makeDeps({ getToken: async () => err({ type: 'token_missing' } as never) })
    );
    expect(ctx.token).toBeNull();
    expect(ctx.nameWithOwner).toBe('acme/widget');
  });

  it('returns an empty context when the task is missing', async () => {
    const ctx = await resolveLoopGithubContext('t1', makeDeps({ loadTask: async () => null }));
    expect(ctx.projectId).toBeNull();
    expect(ctx.prUrl).toBeNull();
  });
});

describe('toGithubFacts', () => {
  it('projects the context onto the prompt facts subset', async () => {
    const ctx = await resolveLoopGithubContext('t1', makeDeps());
    expect(toGithubFacts(ctx)).toEqual({
      nameWithOwner: 'acme/widget',
      host: 'github.com',
      branch: 'feature/x',
      prNumber: 7,
      prUrl: 'https://github.com/acme/widget/pull/7',
    });
  });
});
