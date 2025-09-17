import React from "react";
import ReorderList from "./ReorderList";
import { Button } from "./ui/button";
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
  onSelectWorkspace?: (workspace: Workspace) => void;
  activeWorkspace?: Workspace | null;
  onReorderProjects?: (sourceId: string, targetId: string) => void;
  onReorderProjectsFull?: (newOrder: Project[]) => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  projects,
  selectedProject,
  onSelectProject,
  onGoHome,
  onSelectWorkspace,
  activeWorkspace,
  onReorderProjects,
  onReorderProjectsFull,
}) => {
  return (
    <div className="flex-shrink-0 w-16 sm:w-64 lg:w-80 bg-gray-50 dark:bg-gray-900  h-screen overflow-y-auto overscroll-contain">
      <div className="p-2 sm:p-4">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onGoHome}
            className="w-full justify-center sm:justify-start mt-5 p-3 h-auto"
            aria-label="Home"
          >
            <Home className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-3 text-gray-600 dark:text-gray-400" />
            <span className="hidden sm:inline text-sm font-medium">Home</span>
          </Button>
        </div>

        <div className="mb-6">
          <ReorderList
            as="div"
            axis="y"
            items={projects}
            onReorder={(newOrder) => {
              if (onReorderProjectsFull) {
                onReorderProjectsFull(newOrder as Project[]);
              } else if (onReorderProjects) {
                const oldIds = projects.map((p) => p.id);
                const newIds = (newOrder as Project[]).map((p) => p.id);
                for (let i = 0; i < newIds.length; i++) {
                  if (newIds[i] !== oldIds[i]) {
                    const sourceId = newIds.find((id) => id === oldIds[i]);
                    const targetId = newIds[i];
                    if (sourceId && targetId && sourceId !== targetId) {
                      onReorderProjects(sourceId, targetId);
                    }
                    break;
                  }
                }
              }
            }}
            className="space-y-1 list-none p-0 m-0"
            itemClassName="relative group p-2 sm:p-3 cursor-pointer rounded-md list-none"
            getKey={(p) => (p as Project).id}
          >
            {(project) => (
              <div onClick={() => onSelectProject(project as Project)}>
                <div className="flex items-center sm:items-start sm:space-x-3">
                  <div className="hidden sm:block flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(project as Project);
                      }}
                      className="block w-full text-left font-medium text-sm truncate rounded-sm hover:underline hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:underline"
                      title={(project as Project).name}
                    >
                      {(project as Project).name
                        }
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {(project as Project).githubInfo?.repository || (project as Project).path}
                    </p>
                  </div>
                </div>

                {(project as Project).workspaces && (project as Project).workspaces!.length > 0 && (
                  <div className="hidden sm:block mt-2 ml-7 space-y-1">
                    {(project as Project).workspaces!.map((workspace) => {
                      const isActive = activeWorkspace?.id === workspace.id;
                      return (
                        <div
                          key={workspace.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectProject && selectedProject?.id !== (project as Project).id) {
                              onSelectProject(project as Project);
                            }
                            onSelectWorkspace && onSelectWorkspace(workspace);
                          }}
                          className={`-mx-2 px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 ${
                            isActive ? "bg-black/5 dark:bg-white/5" : ""
                          }`}
                          title={workspace.name}
                        >
                          <WorkspaceItem workspace={workspace} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </ReorderList>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;
