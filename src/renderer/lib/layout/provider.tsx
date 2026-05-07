import { reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, type ReactNode } from 'react';
import { type ViewId, type WrapParams } from '@renderer/app/view-registry';
import { appState } from '@renderer/lib/stores/app-state';
import { focusTracker } from '@renderer/utils/focus-tracker';
import { clearTelemetryTaskScope, setTelemetryTaskScope } from '@renderer/utils/telemetry-scope';
import { captureTelemetry } from '@renderer/utils/telemetryClient';

type ViewParamsStore = Partial<{ [K in ViewId]: WrapParams<K> }>;

function syncTelemetryScope(currentViewId: ViewId, viewParamsStore: ViewParamsStore): void {
  if (currentViewId !== 'task') {
    clearTelemetryTaskScope();
    return;
  }

  const taskParams = viewParamsStore.task;
  if (
    taskParams &&
    typeof taskParams.projectId === 'string' &&
    typeof taskParams.taskId === 'string'
  ) {
    setTelemetryTaskScope({ projectId: taskParams.projectId, taskId: taskParams.taskId });
    return;
  }

  clearTelemetryTaskScope();
}

const viewEvents: Record<
  ViewId,
  | 'home_viewed'
  | 'project_viewed'
  | 'task_viewed'
  | 'settings_viewed'
  | 'skills_viewed'
  | 'mcp_viewed'
> = {
  home: 'home_viewed',
  project: 'project_viewed',
  task: 'task_viewed',
  settings: 'settings_viewed',
  skills: 'skills_viewed',
  mcp: 'mcp_viewed',
};

export const WorkspaceViewProvider = observer(function WorkspaceViewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const currentViewId = appState.navigation.currentViewId;

  useEffect(() => {
    const initialViewId = appState.navigation.currentViewId;
    focusTracker.initialize({ view: initialViewId });
    syncTelemetryScope(initialViewId, appState.navigation.viewParamsStore as ViewParamsStore);
    captureTelemetry(viewEvents[initialViewId], { from_view: null });
  }, []);

  useEffect(() => {
    return reaction(
      () => ({
        viewId: appState.navigation.currentViewId,
        params: appState.navigation.viewParamsStore,
      }),
      ({ viewId, params }) => {
        syncTelemetryScope(viewId as ViewId, params as ViewParamsStore);
      }
    );
  }, []);

  useEffect(() => {
    runInAction(() => {
      appState.navigation.isNavigating = false;
    });
  }, [currentViewId]);

  return <>{children}</>;
});
