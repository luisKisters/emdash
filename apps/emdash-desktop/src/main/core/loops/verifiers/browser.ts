import { previewServerUrl, type PreviewServer } from '@shared/core/preview-servers/types';
import type { Verifier } from './types';

/** Injected seam so the verifier is testable without a real browser, DB, or preview. */
export interface BrowserVerifierDeps {
  loadTask(taskId: string): Promise<{ projectId: string; workspaceId: string | null } | null>;
  listPreviews(input: {
    projectId: string;
    workspaceId: string;
  }): PreviewServer[] | Promise<PreviewServer[]>;
  getActiveBrowser(): string | null | Promise<string | null>;
  verifyUrl(
    browserId: string,
    url: string,
    options: { selector?: string; waitMs?: number }
  ): Promise<{ ok: boolean; title: string; error?: string }>;
}

// The real deps pull in the Electron-bound DB client + browser/preview services, so
// they are imported lazily to keep the verifier registry importable in `node` tests.
const defaultDeps: BrowserVerifierDeps = {
  async loadTask(taskId) {
    const { eq } = await import('drizzle-orm');
    const { db } = await import('@main/db/client');
    const { tasks } = await import('@main/db/schema');
    const [row] = await db
      .select({ projectId: tasks.projectId, workspaceId: tasks.workspaceId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return row ?? null;
  },
  async listPreviews(input) {
    const { previewServerService } =
      await import('@main/core/preview-servers/preview-server-service-instance');
    return previewServerService.listForWorkspace(input);
  },
  async getActiveBrowser() {
    const { browserWebContentsRegistry } =
      await import('@main/core/browser/browser-webcontents-registry');
    return browserWebContentsRegistry.getActiveBrowser();
  },
  async verifyUrl(browserId, url, options) {
    const { browserWebContentsRegistry } =
      await import('@main/core/browser/browser-webcontents-registry');
    return browserWebContentsRegistry.verifyUrl(browserId, url, options);
  },
};

/**
 * Optional verifier: loads the task's ready preview URL in emdash's existing in-app
 * browser (`browserWebContentsRegistry.verifyUrl`) and asserts the page loaded. Returns
 * a non-blocking skip when no ready preview URL or no bound browser exists; fails only
 * when the page fails to load or a configured selector is missing.
 */
export function createBrowserVerifier(deps: BrowserVerifierDeps = defaultDeps): Verifier {
  return {
    id: 'browser',
    async run(input) {
      const task = await deps.loadTask(input.taskId);
      if (!task || !task.workspaceId) {
        return { ok: true, skipped: true, output: 'no workspace for task' };
      }

      const previews = await deps.listPreviews({
        projectId: task.projectId,
        workspaceId: task.workspaceId,
      });
      const url = pickReadyPreviewUrl(previews);
      if (!url) {
        return { ok: true, skipped: true, output: 'no ready preview URL' };
      }

      const browserId = await deps.getActiveBrowser();
      if (!browserId) {
        return { ok: true, skipped: true, output: 'no bound in-app browser' };
      }

      const result = await deps.verifyUrl(browserId, url, {});
      if (!result.ok) {
        return { ok: false, output: `browser check failed: ${result.error ?? 'unknown error'}` };
      }
      return { ok: true, output: `loaded ${url} (title: ${result.title})` };
    },
  };
}

function pickReadyPreviewUrl(servers: PreviewServer[]): string | null {
  for (const server of servers) {
    if (server.status.kind !== 'ready') continue;
    const url = previewServerUrl(server);
    if (url) return url;
  }
  return null;
}
