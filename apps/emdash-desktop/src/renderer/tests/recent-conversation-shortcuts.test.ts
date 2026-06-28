import { describe, expect, it } from 'vitest';
import {
  buildRecentConversationShortcuts,
  isRecentConversationModifierPressed,
  recentConversationShortcutNumber,
} from '@renderer/features/tasks/conversations/recent-conversation-shortcuts-utils';
import type { Conversation } from '@shared/core/conversations/conversations';

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

describe('recent conversation shortcuts', () => {
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

  it('detects the platform modifier exactly', () => {
    expect(isRecentConversationModifierPressed({ metaKey: true, ctrlKey: false }, 'mac')).toBe(
      true
    );
    expect(isRecentConversationModifierPressed({ metaKey: false, ctrlKey: true }, 'linux')).toBe(
      true
    );
    expect(isRecentConversationModifierPressed({ metaKey: true, ctrlKey: true }, 'mac')).toBe(
      false
    );
  });

  it('maps unshifted modifier number presses to shortcut numbers', () => {
    expect(
      recentConversationShortcutNumber(
        { key: '4', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac'
      )
    ).toBe(4);
    expect(
      recentConversationShortcutNumber(
        { key: '4', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false },
        'mac'
      )
    ).toBeNull();
    expect(
      recentConversationShortcutNumber(
        { key: '0', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        'mac'
      )
    ).toBeNull();
  });
});
