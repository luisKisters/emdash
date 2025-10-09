import { useEffect } from 'react';
import { initialPromptSentKey } from '../lib/keys';

/**
 * Injects an initial prompt into the provider's terminal once the PTY is ready.
 * One-shot per workspace. Provider-agnostic.
 */
export function useInitialPromptInjection(opts: {
  workspaceId: string;
  providerId: string; // codex | claude | ... used for PTY id prefix
  prompt?: string | null;
  enabled?: boolean;
}) {
  const { workspaceId, providerId, prompt, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const trimmed = (prompt || '').trim();
    if (!trimmed) return;
    const sentKey = initialPromptSentKey(workspaceId);
    if (localStorage.getItem(sentKey) === '1') return;

    const ptyId = `${providerId}-main-${workspaceId}`;
    let sent = false;
    const send = () => {
      try {
        if (sent) return;
        (window as any).electronAPI?.ptyInput?.({ id: ptyId, data: trimmed + '\n' });
        localStorage.setItem(sentKey, '1');
        sent = true;
      } catch {}
    };

    const offData = (window as any).electronAPI?.onPtyData?.(ptyId, (_chunk: string) => {
      setTimeout(send, 150);
      offData?.();
      offStarted?.();
    });
    const offStarted = (window as any).electronAPI?.onPtyStarted?.((info: { id: string }) => {
      if (info?.id === ptyId) setTimeout(send, 250);
    });
    const t = setTimeout(send, 2000);
    return () => {
      clearTimeout(t);
      offStarted?.();
      offData?.();
    };
  }, [enabled, workspaceId, providerId, prompt]);
}

