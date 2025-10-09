import { useEffect, useState } from 'react';
import { activityStore } from '../lib/activityStore';

export function useWorkspaceBusy(workspaceId: string) {
  const [busy, setBusy] = useState(false);
  useEffect(() => activityStore.subscribe(workspaceId, setBusy), [workspaceId]);
  return busy;
}

