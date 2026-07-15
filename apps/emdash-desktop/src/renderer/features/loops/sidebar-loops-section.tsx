import { observer } from 'mobx-react-lite';
import { useEffect, useMemo } from 'react';
import { useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { showModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { LoopsStore } from './loops-store';
import { LoopView } from './loop-view';

/**
 * Sidebar entry for a task's loop. Inert unless `experiments.loops` is on. When
 * a loop exists it renders the control panel; otherwise it offers a button that
 * opens the create-loop modal for this task.
 */
export const SidebarLoopsSection = observer(function SidebarLoopsSection() {
  const loopsEnabled = useAppSettingsKey('experiments').value?.loops ?? false;
  const { taskId } = useTaskViewContext();
  const store = useMemo(() => new LoopsStore(taskId), [taskId]);

  useEffect(() => {
    if (!loopsEnabled) return;
    void store.load();
    return () => store.dispose();
  }, [loopsEnabled, store]);

  if (!loopsEnabled) return null;

  return (
    <div data-testid="sidebar-loops-section">
      {store.loop ? (
        <LoopView store={store} />
      ) : (
        <div className="p-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              showModal('createLoopModal', {
                taskId,
                onSuccess: () => void store.load(),
              })
            }
          >
            Create loop
          </Button>
        </div>
      )}
    </div>
  );
});
