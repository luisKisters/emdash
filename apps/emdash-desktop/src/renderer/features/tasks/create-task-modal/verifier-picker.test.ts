import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultLoopPlanDraft,
  type LoopPlanDraft,
} from '@renderer/features/loops/loop-plan-model';

const mocks = vi.hoisted(() => ({ detectVerifiers: vi.fn() }));

vi.mock('@renderer/lib/ipc', () => ({
  rpc: { loops: { detectVerifiers: mocks.detectVerifiers } },
}));

const { VerifierPicker } = await import('./verifier-picker');

let latest: LoopPlanDraft;

function Harness() {
  const [value, setValue] = useState(createDefaultLoopPlanDraft);
  const [initialized, setInitialized] = useState(false);
  latest = value;
  return React.createElement(VerifierPicker, {
    projectId: 'project-1',
    value,
    initialized,
    onChange: (next: LoopPlanDraft, nextInitialized: boolean) => {
      setValue(next);
      setInitialized(nextInitialized);
    },
  });
}

describe('VerifierPicker', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;
  let client: QueryClient;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = dom.window.document.getElementById('root')!;
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.detectVerifiers.mockResolvedValue({
      success: true,
      data: {
        verifiers: [
          {
            id: 'project-1-browser',
            class: 'browser',
            label: 'Project 1 browser',
            command: 'agent-browser',
            source: 'browser',
          },
        ],
        availability: [],
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    client.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('renders only the active project response and persists browser and custom selections', async () => {
    await act(async () => {
      root.render(
        React.createElement(QueryClientProvider, { client }, React.createElement(Harness))
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Project 1 browser');
      });
    });

    expect(mocks.detectVerifiers).toHaveBeenCalledWith({
      projectId: 'project-1',
      provider: 'codex',
    });
    expect(container.textContent).toContain('Project 1 browser');
    expect(container.textContent).not.toContain('Project 2');
    expect(container.querySelector('[aria-label="Project 1 browser"]')).not.toBeNull();
    expect(latest.terminalGates.e2e).toBe(true);
    expect(latest.validationCommands).toEqual([]);

    const customButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Custom verifier')
    );
    await act(async () =>
      customButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    );
    const input = container.querySelector<HTMLInputElement>('[aria-label="Custom verifier name"]')!;
    await act(async () => {
      input.value = 'Manual QA';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add'
    );
    await act(async () =>
      addButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    );

    expect(latest.verifierPlan).toContainEqual({
      kind: 'custom',
      name: 'Manual QA',
      command: null,
    });
    expect(container.querySelector('[aria-label="Manual QA"]')).not.toBeNull();
  });

  it('keeps custom verifiers usable and retries after detector errors', async () => {
    mocks.detectVerifiers.mockRejectedValueOnce(new Error('Detector unavailable'));
    await act(async () => {
      root.render(
        React.createElement(QueryClientProvider, { client }, React.createElement(Harness))
      );
    });
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Detector unavailable'));
    });

    const customButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Custom verifier')
    );
    await act(async () =>
      customButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    );
    expect(container.querySelector('[aria-label="Custom verifier name"]')).not.toBeNull();

    const retryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Retry'
    );
    await act(async () =>
      retryButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    );
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain('Project 1 browser'));
    });
    expect(mocks.detectVerifiers).toHaveBeenCalledTimes(2);
  });
});
