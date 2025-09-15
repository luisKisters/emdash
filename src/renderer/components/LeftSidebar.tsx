import React from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { FolderOpen, Home } from "lucide-react";
import { WorkspaceItem } from "./WorkspaceItem";

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
  status: "active" | "idle" | "running";
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
                    ? "bg-gray-100 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800"
                    : "hover:bg-gray-100 dark:hover:shadow-lg"
                }`}
                onClick={() => onSelectProject(project)}
              >
                <div className="flex items-center space-x-3">
                  <FolderOpen className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {project.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.githubInfo?.repository || project.path}
                    </p>
                  </div>
                </div>

                {project.workspaces && project.workspaces.length > 0 && (
                  <div className="mt-3 ml-7 space-y-2">
                    {project.workspaces.map((workspace) => (
                      <WorkspaceItem key={workspace.id} workspace={workspace} />
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;
