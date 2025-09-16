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
    <div className="flex-shrink-0 w-16 sm:w-64 lg:w-80 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-screen overflow-y-auto overscroll-contain">
      <div className="p-2 sm:p-4">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onGoHome}
            className="w-full justify-center sm:justify-start mt-5 p-3 h-auto font-serif"
            aria-label="Home"
          >
            <Home className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-3 text-gray-600 dark:text-gray-400" />
            <span className="hidden sm:inline text-sm font-medium">Home</span>
          </Button>
        </div>

        <div className="mb-6">
          <div className="space-y-2">
            {projects.map((project) => (
              <Card
                key={project.id}
                className={`p-2 sm:p-3 cursor-pointer transition-colors ${
                  selectedProject?.id === project.id
                    ? "bg-gray-100 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800"
                    : "hover:bg-gray-100 dark:hover:shadow-lg"
                }`}
                onClick={() => onSelectProject(project)}
                title={project.name}
              >
                <div className="flex items-center sm:items-start sm:space-x-3">
                  <FolderOpen className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                  <div className="hidden sm:block flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{project.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {project.githubInfo?.repository || project.path}
                    </p>
                  </div>
                </div>

                {project.workspaces && project.workspaces.length > 0 && (
                  <div className="hidden sm:block mt-3 ml-7 space-y-2">
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
