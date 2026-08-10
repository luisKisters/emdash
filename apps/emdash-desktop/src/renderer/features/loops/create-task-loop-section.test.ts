import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskLoopSection } from './create-task-loop-section';

const settings = vi.hoisted(() => ({ loopsEnabled: true }));

vi.mock('@renderer/features/settings/use-app-settings-key', () => ({
  useAppSettingsKey: () => ({
    value: { loops: settings.loopsEnabled },
    isLoading: false,
    isSaving: false,
  }),
}));

vi.mock('@renderer/lib/ui/switch', async () => {
  const React = await import('react');
  type MockSwitchProps = {
    checked?: boolean;
    'aria-label'?: string;
    onCheckedChange?: (checked: boolean) => void;
  };
  return {
    Switch: ({ checked = false, 'aria-label': ariaLabel, onCheckedChange }: MockSwitchProps) =>
      React.createElement('button', {
        type: 'button',
        role: 'switch',
        'aria-label': ariaLabel,
        'aria-checked': checked,
        onClick: () => onCheckedChange?.(!checked),
      }),
  };
});

describe('CreateTaskLoopSection', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = dom.window.document.getElementById('root')!;
    root = createRoot(container);
    settings.loopsEnabled = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('is inert when the Loops experiment is disabled', () => {
    settings.loopsEnabled = false;

    act(() => root.render(React.createElement(CreateTaskLoopSection, { onEnable: vi.fn() })));

    expect(container.innerHTML).toBe('');
  });

  it('opens the plan flow without exposing the legacy phase editor', async () => {
    const onEnable = vi.fn();
    act(() => root.render(React.createElement(CreateTaskLoopSection, { onEnable })));

    expect(container.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(
      'Loop setup'
    );
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('Work phases');

    const toggle = container.querySelector<HTMLElement>(
      '[aria-label="Create this task with a Loop"]'
    )!;
    await act(async () => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onEnable).toHaveBeenCalledOnce();
  });
});
