import React from 'react';
import ReorderList from './ReorderList';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from './ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { Home, ChevronDown } from 'lucide-react';
import GithubStatus from './GithubStatus';
import { WorkspaceItem } from './WorkspaceItem';

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

const SidebarToggleButton: React.FC = () => {
  const { toggle } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="absolute -right-3 top-4 z-20 hidden h-9 w-9 items-center justify-center text-muted-foreground hover:bg-background/80 rounded-md lg:inline-flex"
      aria-label="Toggle sidebar"
    ></Button>
  );
};

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
  const renderGithubStatus = () => (
    <GithubStatus
      installed={githubInstalled}
      authenticated={githubAuthenticated}
      user={githubUser}
    />
  );

  return (
    <div className="relative h-full">
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
                      className="justify-start"
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
                  className="space-y-1 list-none p-0 m-0 min-w-0"
                  itemClassName="relative group cursor-pointer rounded-md list-none min-w-0"
                  getKey={(p) => (p as Project).id}
                >
                  {(project) => {
                    const typedProject = project as Project;
                    return (
                      <SidebarMenuItem>
                        <Collapsible defaultOpen className="group/collapsible">
                          <div className="flex w-full items-center rounded-md px-2 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground min-w-0">
                            <button
                              type="button"
                              className="flex flex-1 min-w-0 flex-col text-left bg-transparent outline-none focus-visible:outline-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectProject(typedProject);
                              }}
                            >
                              <span className="truncate block">{typedProject.name}</span>
                              <span className="hidden sm:block truncate text-xs text-muted-foreground">
                                {typedProject.githubInfo?.repository || typedProject.path}
                              </span>
                            </button>
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Toggle workspaces for ${typedProject.name}`}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2 -mr-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                              </button>
                            </CollapsibleTrigger>
                          </div>

                          <CollapsibleContent asChild>
                            <div>
                              {typedProject.workspaces?.length ? (
                                <div className="hidden sm:block mt-2 ml-7 space-y-1 min-w-0">
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
                                          onSelectWorkspace && onSelectWorkspace(workspace);
                                        }}
                                        className={` px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 min-w-0 ${
                                          isActive ? 'bg-black/5 dark:bg-white/5' : ''
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
        <SidebarFooter className="border-t border-gray-200 dark:border-gray-800 px-2 py-2 sm:px-4 sm:py-4">
          <SidebarMenu className="w-full">
            <SidebarMenuItem>
              <SidebarMenuButton
                tabIndex={-1}
                onClick={(e) => e.preventDefault()}
                className="flex w-full items-center justify-start gap-2 px-2 py-2 text-sm text-muted-foreground cursor-default hover:bg-transparent focus-visible:outline-none focus-visible:ring-0"
              >
                <div className="flex flex-1 flex-col min-w-0 text-left gap-1">
                  <div className="hidden sm:block truncate">{renderGithubStatus()}</div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarToggleButton />
    </div>
  );
};

export default LeftSidebar;
