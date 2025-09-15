import React from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { FolderOpen, GitBranch, Bot, Play, Pause, Home } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  path: string;
  gitInfo: {
    isGitRepo: boolean;
    remote?: string;
    branch?: string;
  };
  githubInfo?: {
    repository: string;
    connected: boolean;
  };
  workspaces?: Workspace[];
}

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: 'active' | 'idle' | 'running';
  agentId?: string;
}

interface LeftSidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onGoHome: () => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onGoHome,
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="w-3 h-3 text-green-500" />;
      case 'active':
        return <Pause className="w-3 h-3 text-blue-500" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-gray-300" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'running':
        return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
      case 'active':
        return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
      case 'idle':
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400`;
    }
  };

  return (
    <div className="w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen overflow-y-auto">
      <div className="p-4">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onGoHome}
            className="w-full justify-start mt-5 p-3 h-auto font-serif"
          >
            <Home className="w-4 h-4 mr-3 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium">Home</span>
          </Button>
        </div>
        
        <div className="mb-6">
          <div className="space-y-2">
            {projects.map((project) => (
              <Card
                key={project.id}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedProject?.id === project.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => onSelectProject(project)}
              >
                <div className="flex items-center space-x-3">
                  <FolderOpen className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{project.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.githubInfo?.repository || project.path}
                    </p>
                  </div>
                  {project.gitInfo.branch && (
                    <GitBranch className="w-3 h-3 text-gray-400" />
                  )}
                </div>
                
                {project.workspaces && project.workspaces.length > 0 && (
                  <div className="mt-3 ml-7 space-y-2">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Workspaces ({project.workspaces.length})
                    </div>
                    {project.workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                            {workspace.name}
                          </span>
                          {workspace.agentId && (
                            <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className={getStatusBadge(workspace.status)}>
                          {workspace.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">
              No active agents
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;
