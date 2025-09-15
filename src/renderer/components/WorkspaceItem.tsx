import React from "react";
import { GitBranch, Bot } from "lucide-react";
import { useWorkspaceChanges } from "../hooks/useWorkspaceChanges";
import { ChangesBadge } from "./WorkspaceChanges";

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: "active" | "idle" | "running";
  agentId?: string;
}

interface WorkspaceItemProps {
  workspace: Workspace;
}

export const WorkspaceItem: React.FC<WorkspaceItemProps> = ({ workspace }) => {
  const { totalAdditions, totalDeletions, isLoading } = useWorkspaceChanges(
    workspace.path,
    workspace.id
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
          {workspace.name}
        </span>
        {workspace.agentId && (
          <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />
        )}
      </div>
      <div className="flex items-center space-x-2">
        {!isLoading && (totalAdditions > 0 || totalDeletions > 0) && (
          <ChangesBadge additions={totalAdditions} deletions={totalDeletions} />
        )}
      </div>
    </div>
  );
};
