import { observer } from 'mobx-react-lite';
import { SidebarLoopsSection } from '@renderer/features/loops/sidebar-loops-section';
import { useWorkspaceViewModel } from '@renderer/features/tasks/task-view-context';
import { ShowHide } from '@renderer/lib/ui/show-hide';
import { SidebarConversationsList } from '../conversations/sidebar-conversations-list';
import { ChangesPanel } from '../diff-view/changes-panel/changes-panel';
import { EditorFileTree } from '../editor/editor-file-tree';

export const TaskSidebar = observer(function TaskSidebar() {
  const taskView = useWorkspaceViewModel();
  const { isSidebarCollapsed, sidebarTab: activeTab } = taskView;

  return (
    <div
      className="h-full min-h-0 overflow-hidden"
      style={isSidebarCollapsed ? { display: 'none' } : undefined}
    >
      <ShowHide visible={activeTab === 'conversations'}>
        <div className="flex h-full min-h-0 flex-col">
          <SidebarLoopsSection />
          <div className="min-h-0 flex-1">
            <SidebarConversationsList />
          </div>
        </div>
      </ShowHide>
      <ShowHide visible={taskView.isChangesPanelVisible} lazy>
        <ChangesPanel />
      </ShowHide>
      <ShowHide visible={activeTab === 'files'}>
        <EditorFileTree />
      </ShowHide>
    </div>
  );
});
