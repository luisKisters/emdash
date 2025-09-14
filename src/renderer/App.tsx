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
        setProjects(projects);

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
        setProjects(projectsWithWorkspaces);
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
        alert(`GitHub Authentication Failed:\n\n${result.error}`);
      }
    } catch (error) {
      console.error("Authentication error:", error);
      alert(
        "Authentication error occurred. Please check the console for details."
      );
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
                alert(
                  `⚠️ Git repository detected but couldn't connect to GitHub:\n\n${githubInfo.error}\n\nPath: ${result.path}`
                );
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
            alert(
              `Project opened (not a Git repository)\n\nPath: ${result.path}`
            );
          }
        } catch (error) {
          console.error("Git detection error:", error);
          alert(
            `Project opened\n\nPath: ${result.path}\n\nNote: Could not detect Git information.`
          );
        }
      } else if (result.error) {
        alert(`Failed to open project: ${result.error}`);
      }
    } catch (error) {
      console.error("Open project error:", error);
      alert("Failed to open project. Please check the console for details.");
    }
  };

  const handleImportRepository = async (repo: any) => {
    try {
      // TODO: Implement repository cloning
      alert(
        `Importing repository: ${repo.name}\n\nThis will clone the repository to your local machine.\n\nClone URL: ${repo.clone_url}`
      );
    } catch (error) {
      console.error("Import repository error:", error);
      alert(
        "Failed to import repository. Please check the console for details."
      );
    }
  };

  const handleOpenRepository = async (repo: any) => {
    try {
      // TODO: Implement repository opening
      alert(
        `Opening repository: ${repo.name}\n\nThis will open the repository in your default editor or file manager.\n\nRepository: ${repo.full_name}`
      );
    } catch (error) {
      console.error("Open repository error:", error);
      alert("Failed to open repository. Please check the console for details.");
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

  return (
    <div className="h-screen flex bg-background text-foreground">
      <LeftSidebar
        projects={projects}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        onGoHome={handleGoHome}
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
            <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <WorkspaceTerminalPanel
                workspace={activeWorkspace}
                className="h-full"
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
