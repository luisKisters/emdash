import { describe, expect, it, vi } from 'vitest';
import type { PreviewServer } from '@shared/core/preview-servers/types';
import { createBrowserVerifier, type BrowserVerifierDeps } from './browser';
import type { VerifierRunInput } from './types';

const input = { taskId: 't1', signal: new AbortController().signal } as unknown as VerifierRunInput;

function readyPreview(overrides: Partial<PreviewServer> = {}): PreviewServer {
  return {
    id: 'local:auto',
    kind: 'direct',
    projectId: 'p1',
    workspaceId: 'w1',
    source: { kind: 'manual' },
    protocol: 'http:',
    urlPath: '/',
    status: { kind: 'ready' },
    host: 'localhost',
    port: 5173,
    ...overrides,
  } as PreviewServer;
}

function makeDeps(overrides: Partial<BrowserVerifierDeps> = {}): BrowserVerifierDeps {
  return {
    loadTask: async () => ({ projectId: 'p1', workspaceId: 'w1' }),
    listPreviews: () => [readyPreview()],
    getActiveBrowser: () => 'browser-1',
    verifyUrl: async () => ({ ok: true, title: 'App' }),
    ...overrides,
  };
}

describe('browser verifier', () => {
  it('passes when the preview loads in the in-app browser', async () => {
    const verifyUrl = vi.fn(async () => ({ ok: true, title: 'App' }));
    const result = await createBrowserVerifier(makeDeps({ verifyUrl })).run(input);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(verifyUrl).toHaveBeenCalledWith('browser-1', 'http://localhost:5173/', {});
  });

  it('fails when the browser check reports a load error', async () => {
    const result = await createBrowserVerifier(
      makeDeps({
        verifyUrl: async () => ({ ok: false, title: '', error: 'ERR_CONNECTION_REFUSED' }),
      })
    ).run(input);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('ERR_CONNECTION_REFUSED');
  });

  it('skips (non-blocking) when there is no ready preview URL', async () => {
    const result = await createBrowserVerifier(
      makeDeps({ listPreviews: () => [readyPreview({ status: { kind: 'starting' } })] })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
  });

  it('skips when no in-app browser is bound', async () => {
    const verifyUrl = vi.fn();
    const result = await createBrowserVerifier(
      makeDeps({ getActiveBrowser: () => null, verifyUrl })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(verifyUrl).not.toHaveBeenCalled();
  });

  it('skips when the task has no workspace', async () => {
    const result = await createBrowserVerifier(
      makeDeps({ loadTask: async () => ({ projectId: 'p1', workspaceId: null }) })
    ).run(input);
    expect(result).toMatchObject({ ok: true, skipped: true });
  });
});
