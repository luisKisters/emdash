import { describe, expect, it } from 'vitest';
import {
  buildRecentConversationShortcuts,
  buildRecentTaskShortcuts,
  isRecentConversationModifierKey,
  isRecentConversationModifierPressed,
  isRecentIssueModifierKey,
  isRecentIssueModifierPressed,
  recentConversationShortcutNumber,
  recentIssueShortcutNumber,
  recentShortcutKindFromEvent,
} from '@renderer/features/tasks/conversations/recent-conversation-shortcuts-utils';
import type { Conversation } from '@shared/core/conversations/conversations';
import type { Task } from '@shared/core/tasks/tasks';

function conversation(id: string, lastInteractedAt: string | null): Conversation {
  return {
    id,
    projectId: `project-${id}`,
    taskId: `task-${id}`,
    providerId: 'claude',
    title: id,
    lastInteractedAt,
    isInitialConversation: false,
  };
}

function task(id: string, lastInteractedAt: string | null, overrides: Partial<Task> = {}): Task {
  return {
    id,
    projectId: `project-${id}`,
    name: id,
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: `2026-02-${id.replace(/\D/g, '').padStart(2, '0')}T00:00:00.000Z`,
    statusChangedAt: '2026-01-01T00:00:00.000Z',
    lastInteractedAt: lastInteractedAt ?? undefined,
    isPinned: false,
    prs: [],
    conversations: {},
    type: 'task',
    ...overrides,
  };
}

describe('recent shortcuts', () => {
  it('ranks the nine most recently interacted conversations globally', () => {
    const shortcuts = buildRecentConversationShortcuts(
      Array.from({ length: 11 }, (_, index) =>
        conversation(`c${index}`, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`)
      )
    );

    expect(shortcuts).toHaveLength(9);
    expect(shortcuts[0]).toMatchObject({ conversationId: 'c10', number: 1 });
    expect(shortcuts[8]).toMatchObject({ conversationId: 'c2', number: 9 });
  });

  it('ranks the nine most recently interacted tasks globally', () => {
    const shortcuts = buildRecentTaskShortcuts([
      ...Array.from({ length: 11 }, (_, index) =>
        task(`t${index}`, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`)
      ),
      task('archived', '2026-02-01T00:00:00.000Z', {
        archivedAt: '2026-02-02T00:00:00.000Z',
      }),
      task('automation', '2026-02-03T00:00:00.000Z', { type: 'automation-run' }),
    ]);

    expect(shortcuts).toHaveLength(9);
    expect(shortcuts[0]).toMatchObject({ taskId: 't10', number: 1 });
    expect(shortcuts[8]).toMatchObject({ taskId: 't2', number: 9 });
  });

  it('uses Control for conversations and Meta for issues', () => {
    expect(isRecentConversationModifierPressed({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(isRecentIssueModifierPressed({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(isRecentConversationModifierPressed({ metaKey: true, ctrlKey: false })).toBe(false);
    expect(isRecentIssueModifierPressed({ metaKey: false, ctrlKey: true })).toBe(false);
    expect(recentShortcutKindFromEvent({ metaKey: true, ctrlKey: true })).toBeNull();
  });

  it('detects holding each shortcut modifier key by itself', () => {
    expect(isRecentConversationModifierKey({ key: 'Control' })).toBe(true);
    expect(isRecentConversationModifierKey({ key: 'Meta' })).toBe(false);
    expect(isRecentIssueModifierKey({ key: 'Meta' })).toBe(true);
    expect(isRecentIssueModifierKey({ key: 'OS' })).toBe(true);
    expect(isRecentIssueModifierKey({ key: 'Control' })).toBe(false);
  });

  it('maps unshifted modifier number presses without cross-triggering', () => {
    const controlFour = {
      key: '4',
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    };
    const metaFour = {
      key: '4',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    };

    expect(recentConversationShortcutNumber(controlFour)).toBe(4);
    expect(recentIssueShortcutNumber(controlFour)).toBeNull();
    expect(recentIssueShortcutNumber(metaFour)).toBe(4);
    expect(recentConversationShortcutNumber(metaFour)).toBeNull();
    expect(
      recentConversationShortcutNumber({
        key: '4',
        metaKey: false,
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
      })
    ).toBeNull();
    expect(recentIssueShortcutNumber({ ...metaFour, key: '0' })).toBeNull();
  });
});
