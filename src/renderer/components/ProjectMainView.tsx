import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Spinner } from './ui/spinner';
import { FolderOpen, GitBranch, Plus } from 'lucide-react';

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

interface ProjectMainViewProps {
  project: Project;
  onCreateWorkspace: () => void;
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  isCreatingWorkspace?: boolean;
}

const ProjectMainView: React.FC<ProjectMainViewProps> = ({
  project,
  onCreateWorkspace,
  activeWorkspace,
  onSelectWorkspace,
  isCreatingWorkspace = false,
}) => {
  return (
    <div className="flex-1 bg-white dark:bg-gray-800 h-screen overflow-y-auto">
      <div className="p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {project.path}
              </p>
            </div>
          </div>
          
          {project.gitInfo.branch && (
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <GitBranch className="w-4 h-4" />
              <span>Branching from origin/{project.gitInfo.branch}</span>
            </div>
          )}
        </div>

        <div className="max-w-4xl">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-xl">What's a workspace?</CardTitle>
              <CardDescription>
                Each workspace is an isolated copy and branch of your Git repo. emdash only copies files tracked in Git.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Create isolated environments for different tasks and agents to work on.
                  </p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <FolderOpen className="w-4 h-4" />
                      <span>{project.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <GitBranch className="w-4 h-4" />
                      <span>origin/{project.gitInfo.branch || 'main'}</span>
                    </div>
                  </div>
                </div>
                <Button
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
                      <Plus className="w-4 h-4 mr-2" />
                      Create workspace
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {project.workspaces && project.workspaces.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4">Workspaces</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.workspaces.map((workspace) => (
                  <Card 
                    key={workspace.id} 
                    className={`hover:shadow-lg transition-all cursor-pointer ${
                      activeWorkspace?.id === workspace.id 
                        ? 'ring-2 ring-blue-500 border-blue-500' 
                        : 'hover:shadow-lg'
                    }`}
                    onClick={() => onSelectWorkspace(workspace)}
                  >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-lg">{workspace.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        {(workspace.status === 'running' || workspace.agentId) ? (
                          <Spinner size="sm" className="text-gray-500" />
                        ) : (
                          <GitBranch className="w-4 h-4" />
                        )}
                        <span>Branch: {workspace.branch}</span>
                      </CardDescription>
                    </div>
                  </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span className={`px-2 py-1 rounded text-xs ${
                          workspace.status === 'running' 
                            ? 'bg-green-100 text-green-800' 
                            : workspace.status === 'active'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {workspace.status}
                        </span>
                        {workspace.agentId && (
                          <span className="text-purple-600">Agent Active</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectMainView;
