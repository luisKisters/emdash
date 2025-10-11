import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Spinner } from './ui/spinner';
import { GitBranch, Bot, Play, Pause, Plus } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
}

interface Props {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  isCreatingWorkspace?: boolean;
}

export const WorkspaceList: React.FC<Props> = ({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  isCreatingWorkspace = false,
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-green-500" />;
      case 'idle':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bot className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Workspaces</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateWorkspace}
          disabled={isCreatingWorkspace}
          className="bg-black text-white hover:bg-gray-800"
        >
          {isCreatingWorkspace ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> New
            </>
          )}
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-gray-500">
          <Bot className="mb-4 h-12 w-12" />
          <p className="text-center">No workspaces yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto">
          {workspaces.map((workspace) => (
            <Card
              key={workspace.id}
              className={`cursor-pointer transition-all duration-200 ${
                activeWorkspace?.id === workspace.id
                  ? 'border-blue-500 ring-2 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500'
              }`}
              onClick={() => onSelectWorkspace(workspace)}
            >
              <CardHeader className="p-4">
                <CardTitle className="flex items-center text-lg">
                  {getStatusIcon(workspace.status)}
                  <span className="ml-2">{workspace.name}</span>
                </CardTitle>
                <CardDescription className="mt-1 flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <GitBranch className="mr-1 h-3 w-3" />
                  <code className="font-mono text-xs">{workspace.branch}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-xs text-gray-600 dark:text-gray-300">
                <p className="capitalize">Status: {workspace.status}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceList;
