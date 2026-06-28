import { observer } from 'mobx-react-lite';
import type { TabItemProps } from '@renderer/features/tabs/core/tab-provider';
import {
  GenericTabDragPreview,
  GenericTabItem,
} from '@renderer/features/tabs/tab-bar/generic-tab-item';
import { TabTitle } from '@renderer/features/tabs/tab-bar/tab-title';
import { AgentIcon } from '@renderer/lib/components/agent-icon';
import { MAX_CONVERSATION_TITLE_LENGTH } from '@shared/core/conversations/conversations';
import { AgentStatusIndicator } from '../components/agent-status-indicator';
import type { ConversationResolvedData } from './conversation-tab-provider';
import { formatConversationTitleForDisplay } from './conversation-title-utils';
import {
  RecentConversationShortcutBadge,
  useRecentConversationShortcut,
} from './recent-conversation-shortcuts';

export const ConversationTabItem = observer(function ConversationTabItem({
  tab,
  host,
  ctx,
}: TabItemProps<ConversationResolvedData>) {
  const title = formatConversationTitleForDisplay(tab.store.data.providerId, tab.store.data.title);
  const rawTitle = tab.store.data.title ?? '';
  const shortcut = useRecentConversationShortcut(tab.store.data.id);

  return (
    <GenericTabItem
      tab={tab}
      host={host}
      ctx={ctx}
      label={title}
      preSlot={<AgentIcon id={tab.store.data.providerId} size={16} />}
      labelSlot={
        <span className="flex min-w-0 items-center gap-1.5 px-1.5">
          <TabTitle
            isActive={tab.isActive}
            isPreview={tab.isPreview}
            className="px-0"
            maxWidth="max-w-[180px]"
          >
            {title}
          </TabTitle>
          <RecentConversationShortcutBadge shortcut={shortcut} />
        </span>
      }
      statusSlot={
        <span className="transition-opacity group-hover:opacity-0">
          <AgentStatusIndicator status={tab.store.indicatorStatus} disableTooltip />
        </span>
      }
      kindCommands={[
        {
          id: 'conversation:rename',
          label: 'Rename',
          group: 'edit',
          shortcut: 'tabRename',
          run: () => host.requestRename(tab.tabId),
        },
      ]}
      renameValue={rawTitle}
      renameMaxLength={MAX_CONVERSATION_TITLE_LENGTH}
    />
  );
});

export const ConversationTabDragPreview = observer(function ConversationTabDragPreview({
  tab,
}: {
  tab: { store: ConversationResolvedData['store'] };
}) {
  const label = formatConversationTitleForDisplay(tab.store.data.providerId, tab.store.data.title);
  return (
    <GenericTabDragPreview
      preSlot={
        tab.store.data.providerId ? (
          <AgentIcon id={tab.store.data.providerId} size={16} className="shrink-0" />
        ) : undefined
      }
      label={label}
    />
  );
});
