import React from "react";
import ReorderList from "./ReorderList";
import { Button } from "./ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "./ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./ui/collapsible";
import { Home, CheckCircle2, AlertCircle, Check, ChevronDown } from "lucide-react";
import githubLogo from "../../assets/images/github.png";
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
  githubInstalled?: boolean;
  githubAuthenticated?: boolean;
  githubUser?: { login?: string; name?: string } | null;
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
  githubInstalled = true,
  githubAuthenticated = false,
  githubUser,
}) => {
  const renderGithubStatus = () => {
    if (!githubInstalled) {
      return (
        <div className="flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Install GitHub CLI</p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              Required for repo status and auth
            </p>
          </div>
        </div>
      );
    }

    if (!githubAuthenticated) {
      return (
        <div className="flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">GitHub not authenticated</p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-200/80">
              Run <code className="bg-amber-100 px-1 rounded">gh auth login</code>
            </p>
          </div>
        </div>
      );
    }

    const displayName = githubUser?.login || githubUser?.name || "GitHub account";

    return (
      <div className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 space-x-2">
        <img
          src={githubLogo}
          alt="GitHub"
          className="w-4 h-4 rounded-sm object-contain"
        />
        <span className="font-medium flex items-center space-x-1 min-w-0">
          <span className="truncate">{displayName}</span>
          <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" aria-hidden="true" />
        </span>
      </div>
    );
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup className="mb-2">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Button
                      variant="ghost"
                      onClick={onGoHome}
                      aria-label="Home"
                      className="justify-start mt-5"
                    >
                      <Home className="w-5 h-5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                      <span className="hidden sm:inline text-sm font-medium">Home</span>
                    </Button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="sr-only">Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
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
                  itemClassName="relative group cursor-pointer rounded-md list-none"
                  getKey={(p) => (p as Project).id}
                >
                  {(project) => {
                    const typedProject = project as Project;
                    return (
                      <SidebarMenuItem>
                        <Collapsible defaultOpen className="group/collapsible">
                          <CollapsibleTrigger
                            className="flex w-full items-center justify-start rounded-md px-2 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProject(typedProject);
                            }}
                          >
                            <span className="flex flex-1 flex-col min-w-0 text-left">
                              <span className="truncate">
                                {typedProject.name}
                              </span>
                              <span className="hidden sm:block text-xs text-muted-foreground truncate">
                                {typedProject.githubInfo?.repository || typedProject.path}
                              </span>
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 group-data-[state=open]/collapsible:rotate-180" />
                          </CollapsibleTrigger>

                          <CollapsibleContent asChild>
                            <div>
                              {typedProject.workspaces?.length ? (
                                <div className="hidden sm:block mt-2 ml-7 space-y-1">
                                  {typedProject.workspaces.map((workspace) => {
                                    const isActive = activeWorkspace?.id === workspace.id;
                                    return (
                                      <div
                                        key={workspace.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (
                                            onSelectProject &&
                                            selectedProject?.id !== typedProject.id
                                          ) {
                                            onSelectProject(typedProject);
                                          }
                                          onSelectWorkspace &&
                                            onSelectWorkspace(workspace);
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
                              ) : null}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </SidebarMenuItem>
                    );
                  }}
                </ReorderList>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <div className="hidden sm:block border-t border-gray-200 dark:border-gray-800 p-4">
          {renderGithubStatus()}
        </div>
        <div className="sm:hidden border-t border-gray-200 dark:border-gray-800 px-2 py-2 flex justify-start">
          {githubInstalled && githubAuthenticated ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" aria-label="GitHub connected" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-500" aria-label="GitHub not connected" />
          )}
        </div>
      </Sidebar>
    </SidebarProvider>
  );
};

export default LeftSidebar;
