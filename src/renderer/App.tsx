import React, { useState, useEffect } from "react";
import { Button } from "./components/ui/button";

import { Spinner } from "./components/ui/spinner";
import { FolderOpen, Github, Globe, Check } from "lucide-react";
import RepositoryList from "./components/RepositoryList";
import LeftSidebar from "./components/LeftSidebar";
import ProjectMainView from "./components/ProjectMainView";
import WorkspaceModal from "./components/WorkspaceModal";
import TerminalPane from "./components/TerminalPane";
import ChatInterface from "./components/ChatInterface";
import WorkspaceTerminalPanel from "./components/WorkspaceTerminalPanel";
import FileChangesPanel from "./components/FileChangesPanel";
import { Toaster } from "./components/ui/toaster";
import { useToast } from "./hooks/use-toast";

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

const App: React.FC = () => {
  const { toast } = useToast();
  const [version, setVersion] = useState<string>("");
  const [platform, setPlatform] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState<boolean>(false);
  const [showHomeView, setShowHomeView] = useState<boolean>(true);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState<boolean>(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    null
  );

  // Persist and apply custom project order (by id)
  const ORDER_KEY = "sidebarProjectOrder";
  const applyProjectOrder = (list: Project[]) => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (!raw) return list;
      const order: string[] = JSON.parse(raw);
      const indexOf = (id: string) => {
        const idx = order.indexOf(id);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };
      return [...list].sort((a, b) => indexOf(a.id) - indexOf(b.id));
    } catch {
      return list;
    }
  };
  const saveProjectOrder = (list: Project[]) => {
    try {
      const ids = list.map((p) => p.id);
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
    } catch {}
  };

  useEffect(() => {
    const loadAppData = async () => {
      try {
        const [appVersion, appPlatform, authStatus, projects] =
          await Promise.all([
            window.electronAPI.getVersion(),
            window.electronAPI.getPlatform(),
            window.electronAPI.githubIsAuthenticated(),
            window.electronAPI.getProjects(),
          ]);

        setVersion(appVersion);
        setPlatform(appPlatform);
        setIsAuthenticated(authStatus);
        setProjects(applyProjectOrder(projects));

        if (authStatus) {
          const [userInfo, repos] = await Promise.all([
            window.electronAPI.githubGetUser(),
            window.electronAPI.githubGetRepositories(),
          ]);
          setUser(userInfo);
          setRepositories(repos);
        }

        const projectsWithWorkspaces = await Promise.all(
          projects.map(async (project) => {
            const workspaces = await window.electronAPI.getWorkspaces(
              project.id
            );
            return { ...project, workspaces };
          })
        );
        const ordered = applyProjectOrder(projectsWithWorkspaces);
        setProjects(ordered);
      } catch (error) {
        console.error("Failed to load app data:", error);
      }
    };

    loadAppData();
  }, []);

  const handleGitHubAuth = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.githubAuth();
      if (result.success) {
        setIsAuthenticated(true);
        setUser(result.user);
        const repos = await window.electronAPI.githubGetRepositories();
        setRepositories(repos);
      } else {
        toast({
          title: "GitHub Authentication Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Authentication error:", error);
      toast({
        title: "Authentication Error",
        description: "Please check the console for details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.githubLogout();
      setIsAuthenticated(false);
      setUser(null);
      setRepositories([]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleOpenProject = async () => {
    try {
      const result = await window.electronAPI.openProject();
      if (result.success && result.path) {
        try {
          const gitInfo = await window.electronAPI.getGitInfo(result.path);
          if (gitInfo.isGitRepo) {
            if (isAuthenticated) {
              const githubInfo = await window.electronAPI.connectToGitHub(
                result.path
              );
              if (githubInfo.success) {
                const projectName =
                  result.path.split("/").pop() || "Unknown Project";
                const newProject: Project = {
                  id: Date.now().toString(),
                  name: projectName,
                  path: result.path,
                  gitInfo: {
                    isGitRepo: true,
                    remote: gitInfo.remote || undefined,
                    branch: gitInfo.branch || undefined,
                  },
                  githubInfo: {
                    repository: githubInfo.repository || "",
                    connected: true,
                  },
                  workspaces: [],
                };

                // Save to database
                const saveResult = await window.electronAPI.saveProject(
                  newProject
                );
                if (saveResult.success) {
                  setProjects((prev) => [...prev, newProject]);
                  setSelectedProject(newProject);
                } else {
                  console.error("Failed to save project:", saveResult.error);
                }
                // alert(`✅ Project connected to GitHub!\n\nRepository: ${githubInfo.repository}\nBranch: ${githubInfo.branch}\nPath: ${result.path}`);
              } else {
                toast({
                  title: "GitHub Connection Failed",
                  description: `Git repository detected but couldn't connect to GitHub: ${githubInfo.error}`,
                  variant: "destructive",
                });
              }
            } else {
              // User not authenticated - still save the project
              const projectName =
                result.path.split("/").pop() || "Unknown Project";
              const newProject: Project = {
                id: Date.now().toString(),
                name: projectName,
                path: result.path,
                gitInfo: {
                  isGitRepo: true,
                  remote: gitInfo.remote || undefined,
                  branch: gitInfo.branch || undefined,
                },
                githubInfo: {
                  repository: "",
                  connected: false,
                },
                workspaces: [],
              };

              // Save to database
              const saveResult = await window.electronAPI.saveProject(
                newProject
              );
              if (saveResult.success) {
                setProjects((prev) => [...prev, newProject]);
                setSelectedProject(newProject);
              } else {
                console.error("Failed to save project:", saveResult.error);
              }
            }
          } else {
            // Not a Git repository
            toast({
              title: "Project Opened",
              description: `This directory is not a Git repository. Path: ${result.path}`,
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Git detection error:", error);
          toast({
            title: "Project Opened",
            description: `Could not detect Git information. Path: ${result.path}`,
            variant: "destructive",
          });
        }
      } else if (result.error) {
        toast({
          title: "Failed to Open Project",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Open project error:", error);
      toast({
        title: "Failed to Open Project",
        description: "Please check the console for details.",
        variant: "destructive",
      });
    }
  };

  const handleImportRepository = async (repo: any) => {
    try {
      // TODO: Implement repository cloning
      toast({
        title: "Import Repository",
        description: `Importing ${repo.name} - This will clone the repository to your local machine.`,
      });
    } catch (error) {
      console.error("Import repository error:", error);
      toast({
        title: "Failed to Import Repository",
        description: "Please check the console for details.",
        variant: "destructive",
      });
    }
  };

  const handleOpenRepository = async (repo: any) => {
    try {
      // TODO: Implement repository opening
      toast({
        title: "Open Repository",
        description: `Opening ${repo.name} - This will open the repository in your default editor or file manager.`,
      });
    } catch (error) {
      console.error("Open repository error:", error);
      toast({
        title: "Failed to Open Repository",
        description: "Please check the console for details.",
        variant: "destructive",
      });
    }
  };

  const handleCreateWorkspace = async (workspaceName: string) => {
    if (!selectedProject) return;

    setIsCreatingWorkspace(true);
    try {
      // Create Git worktree
      const worktreeResult = await window.electronAPI.worktreeCreate({
        projectPath: selectedProject.path,
        workspaceName,
        projectId: selectedProject.id,
      });

      if (!worktreeResult.success) {
        throw new Error(worktreeResult.error || "Failed to create worktree");
      }

      const worktree = worktreeResult.worktree;

      const newWorkspace: Workspace = {
        id: worktree.id,
        name: workspaceName,
        branch: worktree.branch,
        path: worktree.path,
        status: "idle",
      };

      // Save workspace to database
      const saveResult = await window.electronAPI.saveWorkspace({
        ...newWorkspace,
        projectId: selectedProject.id,
      });

      if (saveResult.success) {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === selectedProject.id
              ? {
                  ...project,
                  workspaces: [...(project.workspaces || []), newWorkspace],
                }
              : project
          )
        );

        setSelectedProject((prev) =>
          prev
            ? {
                ...prev,
                workspaces: [...(prev.workspaces || []), newWorkspace],
              }
            : null
        );

        toast({
          title: "Workspace Created",
          description: `"${workspaceName}" workspace created successfully!`,
        });
      } else {
        console.error("Failed to save workspace:", saveResult.error);
        toast({
          title: "Error",
          description:
            "Failed to create workspace. Please check the console for details.",
        });
      }
    } catch (error) {
      console.error("Failed to create workspace:", error);
      toast({
        title: "Error",
        description:
          "Failed to create workspace. Please check the console for details.",
      });
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleGoHome = () => {
    setSelectedProject(null);
    setShowHomeView(true);
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setShowHomeView(false);
    setActiveWorkspace(null);
  };

  const handleSelectWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace);
  };

  const handleReorderProjects = (sourceId: string, targetId: string) => {
    setProjects((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((p) => p.id === sourceId);
      const toIdx = list.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      saveProjectOrder(list);
      return list;
    });
  };

  const handleReorderProjectsFull = (newOrder: Project[]) => {
    setProjects(() => {
      const list = [...newOrder];
      saveProjectOrder(list);
      return list;
    });
  };

  return (
    <div className="h-screen flex bg-background text-foreground">
      <LeftSidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        onGoHome={handleGoHome}
        onSelectWorkspace={handleSelectWorkspace}
        activeWorkspace={activeWorkspace || undefined}
        onReorderProjects={handleReorderProjects}
        onReorderProjectsFull={handleReorderProjectsFull}
      />

      {showHomeView ? (
        <div className="flex-1 bg-background text-foreground overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            <div className="text-center mb-12">
              <h1 className="text-6xl font-serif tracking-wider mb-4">
                orcbench
              </h1>
              <p className="text-lg font-serif text-gray-700 text-muted-foreground mb-4">
                Run multiple Codex Agents in parallel
              </p>
              {!isAuthenticated && (
                <div className="text-sm text-gray-500 max-w-2xl mx-auto">
                  <p className="mb-2">
                    <strong>Requirements:</strong> GitHub CLI must be installed
                    and authenticated
                  </p>
                  <p className="text-xs">
                    Install:{" "}
                    <code className="bg-gray-100 px-1 rounded">
                      brew install gh
                    </code>{" "}
                    • Authenticate:{" "}
                    <code className="bg-gray-100 px-1 rounded">
                      gh auth login
                    </code>
                  </p>
                </div>
              )}
            </div>

            {isAuthenticated && user && (
              <div className="text-center mb-8">
                <div className="inline-flex items-center bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full mr-3"
                  />
                  <span className="text-green-800 font-medium">
                    Signed in as {user.name} (@{user.login})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="ml-3 text-green-600 hover:text-green-800"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Button
                onClick={handleOpenProject}
                size="lg"
                className="min-w-[200px] bg-black text-white hover:bg-gray-800 hover:text-white border-black font-serif"
              >
                <FolderOpen className="mr-2 h-5 w-5" />
                Open Project
              </Button>
              <Button
                onClick={isAuthenticated ? handleLogout : handleGitHubAuth}
                disabled={isLoading}
                variant="outline"
                size="lg"
                className="min-w-[200px] font-serif bg-black text-white hover:bg-gray-800 hover:text-white border-black"
              >
                {isLoading ? (
                  <Spinner size="sm" className="mr-2" />
                ) : isAuthenticated ? (
                  <Check className="mr-2 h-5 w-5" />
                ) : (
                  <Github className="mr-2 h-5 w-5" />
                )}
                {isLoading
                  ? "Connecting..."
                  : isAuthenticated
                  ? "Connected"
                  : "Open from GitHub"}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="min-w-[200px] font-serif bg-black text-white hover:bg-gray-800 hover:text-white border-black"
              >
                <Globe className="mr-2 h-5 w-5 text-white" />
                Clone from URL
              </Button>
            </div>

            {isAuthenticated && repositories.length > 0 && (
              <RepositoryList
                repositories={repositories}
                onImportRepository={handleImportRepository}
                onOpenRepository={handleOpenRepository}
              />
            )}
          </div>
        </div>
      ) : selectedProject ? (
        <div className="flex-1 flex bg-background text-foreground">
          <div className="flex-1">
            {activeWorkspace ? (
              <ChatInterface
                workspace={activeWorkspace}
                projectName={selectedProject.name}
                className="h-full"
              />
            ) : (
              <ProjectMainView
                project={selectedProject}
                onCreateWorkspace={() => setShowWorkspaceModal(true)}
                activeWorkspace={activeWorkspace}
                onSelectWorkspace={handleSelectWorkspace}
                isCreatingWorkspace={isCreatingWorkspace}
              />
            )}
          </div>

          {activeWorkspace && (
            <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col h-screen max-h-screen">
              <FileChangesPanel
                workspaceId={activeWorkspace.path}
                className="flex-shrink-0"
              />
              <WorkspaceTerminalPanel
                workspace={activeWorkspace}
                className="flex-1 min-h-0"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 bg-background text-foreground overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            <div className="text-center mb-12">
              <h1 className="text-6xl font-serif tracking-wider mb-4">
                orcbench
              </h1>
              <p className="text-lg font-serif text-gray-700 text-muted-foreground mb-4">
                Run multiple Codex Agents in parallel
              </p>
              {!isAuthenticated && (
                <div className="text-sm text-gray-500 max-w-2xl mx-auto">
                  <p className="mb-2">
                    <strong>Requirements:</strong> GitHub CLI must be installed
                    and authenticated
                  </p>
                  <p className="text-xs">
                    Install:{" "}
                    <code className="bg-gray-100 px-1 rounded">
                      brew install gh
                    </code>{" "}
                    • Authenticate:{" "}
                    <code className="bg-gray-100 px-1 rounded">
                      gh auth login
                    </code>
                  </p>
                </div>
              )}
            </div>

            {isAuthenticated && user && (
              <div className="text-center mb-8">
                <div className="inline-flex items-center bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full mr-3"
                  />
                  <span className="text-green-800 font-medium">
                    Signed in as {user.name} (@{user.login})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="ml-3 text-green-600 hover:text-green-800"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Button
                onClick={handleOpenProject}
                size="lg"
                className="min-w-[200px] bg-black text-white hover:bg-gray-800 hover:text-white border-black font-serif"
              >
                <FolderOpen className="mr-2 h-5 w-5" />
                Open Project
              </Button>
              <Button
                onClick={isAuthenticated ? handleLogout : handleGitHubAuth}
                disabled={isLoading}
                variant="outline"
                size="lg"
                className="min-w-[200px] font-serif bg-black text-white hover:bg-gray-800 hover:text-white border-black"
              >
                {isLoading ? (
                  <Spinner size="sm" className="mr-2" />
                ) : isAuthenticated ? (
                  <Check className="mr-2 h-5 w-5" />
                ) : (
                  <Github className="mr-2 h-5 w-5" />
                )}
                {isLoading
                  ? "Connecting..."
                  : isAuthenticated
                  ? "Connected"
                  : "Open from GitHub"}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="min-w-[200px] font-serif bg-black text-white hover:bg-gray-800 hover:text-white border-black"
              >
                <Globe className="mr-2 h-5 w-5 text-white" />
                Clone from URL
              </Button>
            </div>

            {isAuthenticated && repositories.length > 0 && (
              <RepositoryList
                repositories={repositories}
                onImportRepository={handleImportRepository}
                onOpenRepository={handleOpenRepository}
              />
            )}
          </div>
        </div>
      )}

      <WorkspaceModal
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
        onCreateWorkspace={handleCreateWorkspace}
        projectName={selectedProject?.name || ""}
        defaultBranch={selectedProject?.gitInfo.branch || "main"}
      />
      <Toaster />
    </div>
  );
};

export default App;
