import type { detectPlatform } from '@tanstack/react-hotkeys';
import type { Conversation } from '@shared/core/conversations/conversations';

export const RECENT_CONVERSATION_SHORTCUT_LIMIT = 9;

export interface RecentConversationShortcut {
  conversationId: string;
  projectId: string;
  taskId: string;
  number: number;
}

type ShortcutEventInput = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>;

type ShortcutPlatform = ReturnType<typeof detectPlatform>;

function conversationSortTime(conversation: Conversation): number {
  return conversation.lastInteractedAt ? new Date(conversation.lastInteractedAt).getTime() : 0;
}

export function buildRecentConversationShortcuts(
  conversations: readonly Conversation[]
): RecentConversationShortcut[] {
  return [...conversations]
    .sort((a, b) => {
      const timeDelta = conversationSortTime(b) - conversationSortTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, RECENT_CONVERSATION_SHORTCUT_LIMIT)
    .map((conversation, index) => ({
      conversationId: conversation.id,
      projectId: conversation.projectId,
      taskId: conversation.taskId,
      number: index + 1,
    }));
}

export function isRecentConversationModifierPressed(
  event: Pick<ShortcutEventInput, 'ctrlKey' | 'metaKey'>,
  platform: ShortcutPlatform
): boolean {
  return platform === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function recentConversationShortcutNumber(
  event: ShortcutEventInput,
  platform: ShortcutPlatform
): number | null {
  if (!isRecentConversationModifierPressed(event, platform)) return null;
  if (event.altKey || event.shiftKey) return null;

  const number = Number(event.key);
  if (!Number.isInteger(number) || number < 1 || number > RECENT_CONVERSATION_SHORTCUT_LIMIT) {
    return null;
  }
  return number;
}
