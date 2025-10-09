import React from 'react';
import { GitBranch, Bot } from 'lucide-react';
import WorkspaceDeleteButton from './WorkspaceDeleteButton';
import { useWorkspaceChanges } from '../hooks/useWorkspaceChanges';
import { ChangesBadge } from './WorkspaceChanges';
import { Spinner } from './ui/spinner';
import { usePrStatus } from '../hooks/usePrStatus';
import { useWorkspaceBusy } from '../hooks/useWorkspaceBusy';

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
}

interface WorkspaceItemProps {
  workspace: Workspace;
  onDelete?: () => void | Promise<void>;
}

export const WorkspaceItem: React.FC<WorkspaceItemProps> = ({ workspace, onDelete }) => {
  const { totalAdditions, totalDeletions, isLoading } = useWorkspaceChanges(
    workspace.path,
    workspace.id
  );
  const { pr } = usePrStatus(workspace.path);
  const isRunning = useWorkspaceBusy(workspace.id);

  return (
    <div className="flex items-center justify-between min-w-0">
      <div className="flex items-center gap-2 py-1 flex-1 min-w-0">
        {isRunning || workspace.status === 'running' || workspace.agentId ? (
          <Spinner size="sm" className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate block">
          {workspace.name}
        </span>
        {workspace.agentId && <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />}
        {/* No left-side delete icon; only show next to status badge on the right */}
      </div>
      <div className="flex items-center space-x-2 flex-shrink-0">
        {!isLoading && (totalAdditions > 0 || totalDeletions > 0) ? (
          <ChangesBadge additions={totalAdditions} deletions={totalDeletions} />
        ) : pr ? (
          <div className="flex items-center gap-1">
            {(pr.state === 'MERGED' || pr.state === 'CLOSED') && onDelete ? (
              <WorkspaceDeleteButton
                workspaceName={workspace.name}
                onConfirm={onDelete}
                aria-label={`Delete workspace ${workspace.name}`}
                className="inline-flex items-center justify-center rounded p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              />
            ) : null}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border 
                ${pr.state === 'MERGED' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
                ${pr.state === 'OPEN' && pr.isDraft ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
                ${pr.state === 'OPEN' && !pr.isDraft ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
                ${pr.state === 'CLOSED' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
              `}
              title={`${pr.title || 'Pull Request'} (#${pr.number})`}
            >
              {pr.isDraft ? 'draft' : pr.state.toLowerCase()}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
