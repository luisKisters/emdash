import type { Conversation } from '@shared/core/conversations/conversations';
import type { Task } from '@shared/core/tasks/tasks';

export const RECENT_CONVERSATION_SHORTCUT_LIMIT = 9;
export const RECENT_TASK_SHORTCUT_LIMIT = 9;

export interface RecentConversationShortcut {
  conversationId: string;
  projectId: string;
  taskId: string;
  number: number;
}

export interface RecentTaskShortcut {
  projectId: string;
  taskId: string;
  number: number;
}

export type RecentShortcutKind = 'conversation' | 'issue';

type ShortcutEventInput = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>;

function conversationSortTime(conversation: Conversation): number {
  return conversation.lastInteractedAt ? new Date(conversation.lastInteractedAt).getTime() : 0;
}

function taskSortTime(task: Task): number {
  return new Date(task.lastInteractedAt ?? task.updatedAt ?? task.createdAt).getTime();
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

export function buildRecentTaskShortcuts(tasks: readonly Task[]): RecentTaskShortcut[] {
  return [...tasks]
    .filter((task) => task.type !== 'automation-run' && !task.archivedAt)
    .sort((a, b) => {
      const timeDelta = taskSortTime(b) - taskSortTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, RECENT_TASK_SHORTCUT_LIMIT)
    .map((task, index) => ({
      projectId: task.projectId,
      taskId: task.id,
      number: index + 1,
    }));
}

export function isRecentConversationModifierPressed(
  event: Pick<ShortcutEventInput, 'ctrlKey' | 'metaKey'>
): boolean {
  return event.ctrlKey && !event.metaKey;
}

export function isRecentIssueModifierPressed(
  event: Pick<ShortcutEventInput, 'ctrlKey' | 'metaKey'>
): boolean {
  return event.metaKey && !event.ctrlKey;
}

export function isRecentConversationModifierKey(event: Pick<ShortcutEventInput, 'key'>): boolean {
  const key = event.key.toLowerCase();
  return key === 'control' || key === 'ctrl';
}

export function isRecentIssueModifierKey(event: Pick<ShortcutEventInput, 'key'>): boolean {
  const key = event.key.toLowerCase();
  return key === 'meta' || key === 'os';
}

export function recentShortcutKindFromEvent(
  event: Pick<ShortcutEventInput, 'ctrlKey' | 'metaKey'>
): RecentShortcutKind | null {
  if (isRecentConversationModifierPressed(event)) return 'conversation';
  if (isRecentIssueModifierPressed(event)) return 'issue';
  return null;
}

export function recentShortcutKindFromModifierKey(
  event: Pick<ShortcutEventInput, 'key'>
): RecentShortcutKind | null {
  if (isRecentConversationModifierKey(event)) return 'conversation';
  if (isRecentIssueModifierKey(event)) return 'issue';
  return null;
}

export function isRecentShortcutModifierKey(event: Pick<ShortcutEventInput, 'key'>): boolean {
  return isRecentConversationModifierKey(event) || isRecentIssueModifierKey(event);
}

export function recentConversationShortcutNumber(event: ShortcutEventInput): number | null {
  if (!isRecentConversationModifierPressed(event)) return null;
  if (event.altKey || event.shiftKey) return null;

  const number = Number(event.key);
  if (!Number.isInteger(number) || number < 1 || number > RECENT_CONVERSATION_SHORTCUT_LIMIT) {
    return null;
  }
  return number;
}

export function recentIssueShortcutNumber(event: ShortcutEventInput): number | null {
  if (!isRecentIssueModifierPressed(event)) return null;
  if (event.altKey || event.shiftKey) return null;

  const number = Number(event.key);
  if (!Number.isInteger(number) || number < 1 || number > RECENT_TASK_SHORTCUT_LIMIT) {
    return null;
  }
  return number;
}
