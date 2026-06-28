import { type Hotkey } from '@tanstack/react-hotkeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { getTaskManagerStore, getTaskView } from '@renderer/features/tasks/stores/task-selectors';
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
  taskCreatedChannel,
  taskProvisionedChannel,
  taskStatusUpdatedChannel,
} from '@shared/core/tasks/taskEvents';
import {
  buildRecentConversationShortcuts,
  buildRecentTaskShortcuts,
  isRecentShortcutModifierKey,
  recentConversationShortcutNumber,
  recentIssueShortcutNumber,
  recentShortcutKindFromEvent,
  recentShortcutKindFromModifierKey,
  type RecentConversationShortcut,
  type RecentShortcutKind,
  type RecentTaskShortcut,
} from './recent-conversation-shortcuts-utils';

const RECENT_CONVERSATION_QUERY_KEY = ['recent-conversation-shortcuts'] as const;
const RECENT_TASK_QUERY_KEY = ['recent-task-shortcuts'] as const;
const SHORTCUT_REVEAL_DELAY_MS = 500;

interface RecentConversationShortcutContextValue {
  shortcutsEnabled: boolean;
  visibleShortcutKind: RecentShortcutKind | null;
  shortcutsByConversationId: ReadonlyMap<string, RecentConversationShortcut>;
  shortcutsByTaskId: ReadonlyMap<string, RecentTaskShortcut>;
}

const EMPTY_CONVERSATION_SHORTCUTS = new Map<string, RecentConversationShortcut>();
const EMPTY_TASK_SHORTCUTS = new Map<string, RecentTaskShortcut>();

const RecentConversationShortcutContext = createContext<RecentConversationShortcutContextValue>({
  shortcutsEnabled: false,
  visibleShortcutKind: null,
  shortcutsByConversationId: EMPTY_CONVERSATION_SHORTCUTS,
  shortcutsByTaskId: EMPTY_TASK_SHORTCUTS,
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

function openTaskShortcut(shortcut: RecentTaskShortcut): void {
  const open = () => {
    const taskManager = getTaskManagerStore(shortcut.projectId);
    void taskManager?.provisionTask(shortcut.taskId);
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

function shortcutKindForKeyDown(event: KeyboardEvent): RecentShortcutKind | null {
  const eventKind = recentShortcutKindFromEvent(event);
  const modifierKeyKind = recentShortcutKindFromModifierKey(event);
  if (eventKind && modifierKeyKind && eventKind !== modifierKeyKind) return null;
  return eventKind ?? (event.ctrlKey || event.metaKey ? null : modifierKeyKind);
}

export function RecentConversationShortcutsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { value: interfaceSettings } = useAppSettingsKey('interface');
  const shortcutsEnabled = interfaceSettings?.experimentalRecentShortcuts ?? false;
  const [visibleShortcutKind, setVisibleShortcutKind] = useState<RecentShortcutKind | null>(null);
  const heldShortcutKindRef = useRef<RecentShortcutKind | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: RECENT_CONVERSATION_QUERY_KEY,
    queryFn: () => rpc.conversations.getConversations(),
    enabled: shortcutsEnabled,
    staleTime: 5_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: RECENT_TASK_QUERY_KEY,
    queryFn: () => rpc.tasks.getTasks(),
    enabled: shortcutsEnabled,
    staleTime: 5_000,
  });

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current === null) return;
    clearTimeout(revealTimeoutRef.current);
    revealTimeoutRef.current = null;
  }, []);

  const setHeldShortcutKind = useCallback(
    (kind: RecentShortcutKind | null) => {
      if (heldShortcutKindRef.current === kind) return;

      heldShortcutKindRef.current = kind;
      clearRevealTimeout();
      if (kind === null) {
        setVisibleShortcutKind(null);
        return;
      }

      revealTimeoutRef.current = setTimeout(() => {
        setVisibleShortcutKind(kind);
        revealTimeoutRef.current = null;
      }, SHORTCUT_REVEAL_DELAY_MS);
    },
    [clearRevealTimeout]
  );

  useEffect(() => () => clearRevealTimeout(), [clearRevealTimeout]);

  useEffect(() => {
    if (!shortcutsEnabled) setHeldShortcutKind(null);
  }, [shortcutsEnabled, setHeldShortcutKind]);

  useEffect(() => {
    const invalidateConversations = () => {
      void queryClient.invalidateQueries({ queryKey: RECENT_CONVERSATION_QUERY_KEY });
    };
    const invalidateTasks = () => {
      void queryClient.invalidateQueries({ queryKey: RECENT_TASK_QUERY_KEY });
    };

    const offConversationCreated = events.on(conversationCreatedChannel, invalidateConversations);
    const offConversationChanged = events.on(conversationChangedChannel, invalidateConversations);
    const offTaskCreated = events.on(taskCreatedChannel, invalidateTasks);
    const offTaskStatusUpdated = events.on(taskStatusUpdatedChannel, invalidateTasks);
    const offTaskProvisioned = events.on(taskProvisionedChannel, invalidateTasks);
    return () => {
      offConversationCreated();
      offConversationChanged();
      offTaskCreated();
      offTaskStatusUpdated();
      offTaskProvisioned();
    };
  }, [queryClient]);

  const conversationShortcuts = useMemo(
    () => (shortcutsEnabled ? buildRecentConversationShortcuts(conversations) : []),
    [shortcutsEnabled, conversations]
  );
  const taskShortcuts = useMemo(
    () => (shortcutsEnabled ? buildRecentTaskShortcuts(tasks) : []),
    [shortcutsEnabled, tasks]
  );
  const conversationShortcutsRef = useRef(conversationShortcuts);
  const taskShortcutsRef = useRef(taskShortcuts);
  useEffect(() => {
    conversationShortcutsRef.current = conversationShortcuts;
  }, [conversationShortcuts]);
  useEffect(() => {
    taskShortcutsRef.current = taskShortcuts;
  }, [taskShortcuts]);

  useEffect(() => {
    if (!shortcutsEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      setHeldShortcutKind(shortcutKindForKeyDown(event));
      if (modalStore.isOpen) return;

      const conversationShortcutNumber = recentConversationShortcutNumber(event);
      if (conversationShortcutNumber !== null) {
        const shortcut = conversationShortcutsRef.current[conversationShortcutNumber - 1];
        if (!shortcut) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openConversationShortcut(shortcut);
        return;
      }

      const issueShortcutNumber = recentIssueShortcutNumber(event);
      if (issueShortcutNumber === null) return;

      const shortcut = taskShortcutsRef.current[issueShortcutNumber - 1];
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openTaskShortcut(shortcut);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isRecentShortcutModifierKey(event)) {
        setHeldShortcutKind(null);
        return;
      }
      setHeldShortcutKind(recentShortcutKindFromEvent(event));
    };

    const handleBlur = () => setHeldShortcutKind(null);

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleBlur);
    };
  }, [shortcutsEnabled, setHeldShortcutKind]);

  const value = useMemo<RecentConversationShortcutContextValue>(() => {
    const shortcutsByConversationId = new Map<string, RecentConversationShortcut>();
    const shortcutsByTaskId = new Map<string, RecentTaskShortcut>();
    for (const shortcut of conversationShortcuts) {
      shortcutsByConversationId.set(shortcut.conversationId, shortcut);
    }
    for (const shortcut of taskShortcuts) {
      shortcutsByTaskId.set(shortcut.taskId, shortcut);
    }
    return {
      shortcutsEnabled,
      visibleShortcutKind,
      shortcutsByConversationId,
      shortcutsByTaskId,
    };
  }, [shortcutsEnabled, visibleShortcutKind, conversationShortcuts, taskShortcuts]);

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

export function useRecentTaskShortcut(taskId: string): RecentTaskShortcut | undefined {
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
  const { visibleShortcutKind } = useContext(RecentConversationShortcutContext);
  if (!shortcut || visibleShortcutKind !== 'conversation') return null;

  return (
    <Shortcut
      hotkey={`Control+${shortcut.number}` as Hotkey}
      variant="keycaps"
      className={cn('opacity-85', className)}
    />
  );
}

export function RecentTaskShortcutBadge({
  shortcut,
  className,
}: {
  shortcut: RecentTaskShortcut | undefined;
  className?: string;
}) {
  const { visibleShortcutKind } = useContext(RecentConversationShortcutContext);
  if (!shortcut || visibleShortcutKind !== 'issue') return null;

  return (
    <Shortcut
      hotkey={`Meta+${shortcut.number}` as Hotkey}
      variant="keycaps"
      className={cn('opacity-85', className)}
    />
  );
}
