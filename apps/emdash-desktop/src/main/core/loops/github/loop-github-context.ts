import { isOk, type Result } from '@emdash/shared';
import { and, eq } from 'drizzle-orm';
import type { GitHubApiAuthError } from '@main/core/github/services/github-api-auth-errors';
import type { GitHubApiAuthContext } from '@main/core/github/services/github-api-auth-service';
import type { ProjectPullRequestContext } from '@main/core/pull-requests/project-pull-request-context';
import type { PullRequestError } from '@shared/core/pull-requests/pull-requests';
import type { GithubFacts } from '../prompt-builder';

/**
 * Repo/PR facts + a best-effort `GH_TOKEN` for a task, resolved through emdash's
 * existing GitHub services. Every field degrades to `null` when no account, remote,
 * or PR is connected — the GitHub check and prompt facts are always best-effort.
 */
export interface LoopGithubContext {
  projectId: string | null;
  accountId: string | null;
  host: string | null;
  nameWithOwner: string | null;
  repositoryUrl: string | null;
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
  headRefOid: string | null;
  token: string | null;
  authContext: GitHubApiAuthContext | null;
}

interface PullRequestRow {
  url: string;
  identifier: string | null;
  headRefOid: string | null;
}

/** Injected seam so the resolver is unit-testable without a real DB or GitHub. */
export interface LoopGithubContextDeps {
  loadTask(taskId: string): Promise<{ projectId: string; workspaceId: string | null } | null>;
  loadBranch(workspaceId: string): Promise<string | null>;
  resolveProjectContext(
    projectId: string
  ): Promise<Result<ProjectPullRequestContext, PullRequestError>>;
  loadPullRequest(repositoryUrl: string, branch: string): Promise<PullRequestRow | null>;
  getToken(
    host: string,
    authContext: GitHubApiAuthContext
  ): Promise<Result<string, GitHubApiAuthError>>;
}

// The real deps pull in the Electron-bound DB client + GitHub services, so they are
// imported lazily to keep this module (and the verifier registry) importable in the
// `node` test project.
const defaultDeps: LoopGithubContextDeps = {
  async loadTask(taskId) {
    const { db } = await import('@main/db/client');
    const { tasks } = await import('@main/db/schema');
    const [row] = await db
      .select({ projectId: tasks.projectId, workspaceId: tasks.workspaceId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return row ?? null;
  },
  async loadBranch(workspaceId) {
    const { db } = await import('@main/db/client');
    const { workspaces } = await import('@main/db/schema');
    const [row] = await db
      .select({ branchName: workspaces.branchName })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return row?.branchName ?? null;
  },
  async resolveProjectContext(projectId) {
    const { resolveProjectPullRequestContext } =
      await import('@main/core/pull-requests/project-pull-request-context');
    return resolveProjectPullRequestContext(projectId);
  },
  async loadPullRequest(repositoryUrl, branch) {
    const { db } = await import('@main/db/client');
    const { pullRequests } = await import('@main/db/schema');
    const [row] = await db
      .select({
        url: pullRequests.url,
        identifier: pullRequests.identifier,
        headRefOid: pullRequests.headRefOid,
      })
      .from(pullRequests)
      .where(
        and(eq(pullRequests.repositoryUrl, repositoryUrl), eq(pullRequests.headRefName, branch))
      )
      .limit(1);
    return row ?? null;
  },
  async getToken(host, authContext) {
    const { githubApiAuthService } =
      await import('@main/core/github/services/github-api-auth-service-instance');
    return githubApiAuthService.getToken(host, authContext);
  },
};

const EMPTY_CONTEXT: LoopGithubContext = {
  projectId: null,
  accountId: null,
  host: null,
  nameWithOwner: null,
  repositoryUrl: null,
  branch: null,
  prNumber: null,
  prUrl: null,
  headRefOid: null,
  token: null,
  authContext: null,
};

function parsePrNumber(identifier: string | null): number | null {
  if (!identifier) return null;
  const n = Number.parseInt(identifier.replace('#', ''), 10);
  return Number.isNaN(n) ? null : n;
}

export async function resolveLoopGithubContext(
  taskId: string,
  deps: LoopGithubContextDeps = defaultDeps
): Promise<LoopGithubContext> {
  try {
    const task = await deps.loadTask(taskId);
    if (!task) return EMPTY_CONTEXT;
    const { projectId } = task;
    const branch = task.workspaceId ? await deps.loadBranch(task.workspaceId) : null;

    const contextResult = await deps.resolveProjectContext(projectId);
    if (!isOk(contextResult)) return { ...EMPTY_CONTEXT, projectId, branch };
    const { repositoryUrl, host, nameWithOwner, authContext } = contextResult.data;

    let prUrl: string | null = null;
    let prNumber: number | null = null;
    let headRefOid: string | null = null;
    if (branch) {
      const pr = await deps.loadPullRequest(repositoryUrl, branch);
      if (pr) {
        prUrl = pr.url;
        headRefOid = pr.headRefOid;
        prNumber = parsePrNumber(pr.identifier);
      }
    }

    let token: string | null = null;
    const tokenResult = await deps.getToken(host, authContext);
    if (isOk(tokenResult)) token = tokenResult.data;

    return {
      projectId,
      accountId: authContext.accountId ?? null,
      host,
      nameWithOwner,
      repositoryUrl,
      branch,
      prNumber,
      prUrl,
      headRefOid,
      token,
      authContext,
    };
  } catch {
    return EMPTY_CONTEXT;
  }
}

/** Maps a resolved context to the plain repo/PR facts handed to the phase agent. */
export function toGithubFacts(context: LoopGithubContext): GithubFacts {
  return {
    nameWithOwner: context.nameWithOwner,
    host: context.host,
    branch: context.branch,
    prNumber: context.prNumber,
    prUrl: context.prUrl,
  };
}
