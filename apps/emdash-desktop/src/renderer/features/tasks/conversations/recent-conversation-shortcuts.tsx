import { detectPlatform, type Hotkey } from '@tanstack/react-hotkeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getTaskView } from '@renderer/features/tasks/stores/task-selectors';
import { events, rpc } from '@renderer/lib/ipc';
import { modalStore } from '@renderer/lib/modal/modal-store';
import { appState } from '@renderer/lib/stores/app-state';
import { Shortcut } from '@renderer/lib/ui/shortcut';
import { cn } from '@renderer/utils/utils';
import {
  conversationChangedChannel,
  conversationCreatedChannel,
} from '@shared/core/conversations/conversationEvents';
import {
  buildRecentConversationShortcuts,
  isRecentConversationModifierKey,
  isRecentConversationModifierPressed,
  recentConversationShortcutNumber,
  type RecentConversationShortcut,
} from './recent-conversation-shortcuts-utils';

const PLATFORM = detectPlatform();
const RECENT_CONVERSATION_QUERY_KEY = ['recent-conversation-shortcuts'] as const;

interface RecentConversationShortcutContextValue {
  isModifierPressed: boolean;
  shortcutsByConversationId: ReadonlyMap<string, RecentConversationShortcut>;
  shortcutsByTaskId: ReadonlyMap<string, RecentConversationShortcut>;
}

const EMPTY_SHORTCUTS = new Map<string, RecentConversationShortcut>();

const RecentConversationShortcutContext = createContext<RecentConversationShortcutContextValue>({
  isModifierPressed: false,
  shortcutsByConversationId: EMPTY_SHORTCUTS,
  shortcutsByTaskId: EMPTY_SHORTCUTS,
});

function openConversationShortcut(shortcut: RecentConversationShortcut): void {
  const open = () => {
    const taskView = getTaskView(shortcut.projectId, shortcut.taskId);
    taskView?.paneLayout.open('conversation', {
      conversationId: shortcut.conversationId,
      preview: false,
    });
    taskView?.setFocusedRegion('main');
    appState.navigation.navigate('task', {
      projectId: shortcut.projectId,
      taskId: shortcut.taskId,
    });
  };

  const project = appState.projects.projects.get(shortcut.projectId);
  if (project?.state === 'unmounted') {
    void appState.projects.mountProject(shortcut.projectId).then(open);
    return;
  }

  open();
}

export function RecentConversationShortcutsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isModifierPressed, setIsModifierPressed] = useState(false);

  const { data: conversations = [] } = useQuery({
    queryKey: RECENT_CONVERSATION_QUERY_KEY,
    queryFn: () => rpc.conversations.getConversations(),
    staleTime: 5_000,
  });

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: RECENT_CONVERSATION_QUERY_KEY });
    };

    const offCreated = events.on(conversationCreatedChannel, invalidate);
    const offChanged = events.on(conversationChangedChannel, invalidate);
    return () => {
      offCreated();
      offChanged();
    };
  }, [queryClient]);

  const shortcuts = useMemo(() => buildRecentConversationShortcuts(conversations), [conversations]);
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setIsModifierPressed(
        isRecentConversationModifierKey(event, PLATFORM) ||
          isRecentConversationModifierPressed(event, PLATFORM)
      );
      if (modalStore.isOpen) return;

      const shortcutNumber = recentConversationShortcutNumber(event, PLATFORM);
      if (shortcutNumber === null) return;

      const shortcut = shortcutsRef.current[shortcutNumber - 1];
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openConversationShortcut(shortcut);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isRecentConversationModifierKey(event, PLATFORM)) {
        setIsModifierPressed(false);
        return;
      }
      setIsModifierPressed(isRecentConversationModifierPressed(event, PLATFORM));
    };

    const handleBlur = () => setIsModifierPressed(false);

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const value = useMemo<RecentConversationShortcutContextValue>(() => {
    const shortcutsByConversationId = new Map<string, RecentConversationShortcut>();
    const shortcutsByTaskId = new Map<string, RecentConversationShortcut>();
    for (const shortcut of shortcuts) {
      shortcutsByConversationId.set(shortcut.conversationId, shortcut);
      if (!shortcutsByTaskId.has(shortcut.taskId)) {
        shortcutsByTaskId.set(shortcut.taskId, shortcut);
      }
    }
    return { isModifierPressed, shortcutsByConversationId, shortcutsByTaskId };
  }, [isModifierPressed, shortcuts]);

  return (
    <RecentConversationShortcutContext.Provider value={value}>
      {children}
    </RecentConversationShortcutContext.Provider>
  );
}

export function useRecentConversationShortcut(
  conversationId: string
): RecentConversationShortcut | undefined {
  const { shortcutsByConversationId } = useContext(RecentConversationShortcutContext);
  return shortcutsByConversationId.get(conversationId);
}

export function useRecentConversationShortcutForTask(
  taskId: string
): RecentConversationShortcut | undefined {
  const { shortcutsByTaskId } = useContext(RecentConversationShortcutContext);
  return shortcutsByTaskId.get(taskId);
}

export function RecentConversationShortcutBadge({
  shortcut,
  className,
}: {
  shortcut: RecentConversationShortcut | undefined;
  className?: string;
}) {
  const { isModifierPressed } = useContext(RecentConversationShortcutContext);
  if (!shortcut || !isModifierPressed) return null;

  return (
    <Shortcut
      hotkey={`Mod+${shortcut.number}` as Hotkey}
      variant="keycaps"
      className={cn('opacity-85', className)}
    />
  );
}
