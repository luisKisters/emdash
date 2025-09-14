// Updated for Codex integration
export {}

declare global {
  interface Window {
    electronAPI: {
      // App info
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>

      // PTY
      ptyStart: (opts: { id: string; cwd?: string; shell?: string; env?: Record<string, string>; cols?: number; rows?: number }) => Promise<{ ok: boolean }>
      ptyInput: (args: { id: string; data: string }) => void
      ptyResize: (args: { id: string; cols: number; rows?: number }) => void
      ptyKill: (id: string) => void
      onPtyData: (id: string, listener: (data: string) => void) => () => void
      onPtyExit: (id: string, listener: (info: { exitCode: number; signal?: number }) => void) => () => void

      // Worktree management
      worktreeCreate: (args: { projectPath: string; workspaceName: string; projectId: string }) => Promise<{ success: boolean; worktree?: any; error?: string }>
      worktreeList: (args: { projectPath: string }) => Promise<{ success: boolean; worktrees?: any[]; error?: string }>
      worktreeRemove: (args: { projectPath: string; worktreeId: string }) => Promise<{ success: boolean; error?: string }>
      worktreeStatus: (args: { worktreePath: string }) => Promise<{ success: boolean; status?: any; error?: string }>
      worktreeMerge: (args: { projectPath: string; worktreeId: string }) => Promise<{ success: boolean; error?: string }>
      worktreeGet: (args: { worktreeId: string }) => Promise<{ success: boolean; worktree?: any; error?: string }>
      worktreeGetAll: () => Promise<{ success: boolean; worktrees?: any[]; error?: string }>

      // Project management
      openProject: () => Promise<{ success: boolean; path?: string; error?: string }>
      getGitInfo: (projectPath: string) => Promise<{ isGitRepo: boolean; remote?: string; branch?: string; path?: string; error?: string }>
      connectToGitHub: (projectPath: string) => Promise<{ success: boolean; repository?: string; branch?: string; error?: string }>

      // Run events
      onRunEvent: (callback: (event: any) => void) => void
      removeRunEventListeners: () => void

      // GitHub integration
      githubAuth: () => Promise<{ success: boolean; token?: string; user?: any; error?: string }>
      githubIsAuthenticated: () => Promise<boolean>
      githubGetUser: () => Promise<any>
      githubGetRepositories: () => Promise<any[]>
      githubLogout: () => Promise<void>

      // Database operations
      getProjects: () => Promise<any[]>
      saveProject: (project: any) => Promise<{ success: boolean; error?: string }>
      getWorkspaces: (projectId?: string) => Promise<any[]>
      saveWorkspace: (workspace: any) => Promise<{ success: boolean; error?: string }>
      deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>
      deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>

      // Codex
      codexCheckInstallation: () => Promise<{ success: boolean; isInstalled?: boolean; error?: string }>
      codexCreateAgent: (workspaceId: string, worktreePath: string) => Promise<{ success: boolean; agent?: any; error?: string }>
      codexSendMessage: (workspaceId: string, message: string) => Promise<{ success: boolean; response?: any; error?: string }>
      codexGetAgentStatus: (workspaceId: string) => Promise<{ success: boolean; agent?: any; error?: string }>
      codexGetAllAgents: () => Promise<{ success: boolean; agents?: any[]; error?: string }>
      codexRemoveAgent: (workspaceId: string) => Promise<{ success: boolean; removed?: boolean; error?: string }>
      codexGetInstallationInstructions: () => Promise<{ success: boolean; instructions?: string; error?: string }>
    }
  }
}

// Explicit type export for better TypeScript recognition
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>

  // PTY
  ptyStart: (opts: { id: string; cwd?: string; shell?: string; env?: Record<string, string>; cols?: number; rows?: number }) => Promise<{ ok: boolean }>
  ptyInput: (args: { id: string; data: string }) => void
  ptyResize: (args: { id: string; cols: number; rows?: number }) => void
  ptyKill: (id: string) => void
  onPtyData: (id: string, listener: (data: string) => void) => () => void
  onPtyExit: (id: string, listener: (info: { exitCode: number; signal?: number }) => void) => () => void

  // Worktree management
  worktreeCreate: (args: { projectPath: string; workspaceName: string; projectId: string }) => Promise<{ success: boolean; worktree?: any; error?: string }>
  worktreeList: (args: { projectPath: string }) => Promise<{ success: boolean; worktrees?: any[]; error?: string }>
  worktreeRemove: (args: { projectPath: string; worktreeId: string }) => Promise<{ success: boolean; error?: string }>
  worktreeStatus: (args: { worktreePath: string }) => Promise<{ success: boolean; status?: any; error?: string }>
  worktreeMerge: (args: { projectPath: string; worktreeId: string }) => Promise<{ success: boolean; error?: string }>
  worktreeGet: (args: { worktreeId: string }) => Promise<{ success: boolean; worktree?: any; error?: string }>
  worktreeGetAll: () => Promise<{ success: boolean; worktrees?: any[]; error?: string }>

  // Project management
  openProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  getGitInfo: (projectPath: string) => Promise<{ isGitRepo: boolean; remote?: string; branch?: string; path?: string; error?: string }>
  connectToGitHub: (projectPath: string) => Promise<{ success: boolean; repository?: string; branch?: string; error?: string }>

  // Run events
  onRunEvent: (callback: (event: any) => void) => void
  removeRunEventListeners: () => void

  // GitHub integration
  githubAuth: () => Promise<{ success: boolean; token?: string; user?: any; error?: string }>
  githubIsAuthenticated: () => Promise<boolean>
  githubGetUser: () => Promise<any>
  githubGetRepositories: () => Promise<any[]>
  githubLogout: () => Promise<void>

  // Database operations
  getProjects: () => Promise<any[]>
  saveProject: (project: any) => Promise<{ success: boolean; error?: string }>
  getWorkspaces: (projectId?: string) => Promise<any[]>
  saveWorkspace: (workspace: any) => Promise<{ success: boolean; error?: string }>
  deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>
  deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>

  // Codex
  codexCheckInstallation: () => Promise<{ success: boolean; isInstalled?: boolean; error?: string }>
  codexCreateAgent: (workspaceId: string, worktreePath: string) => Promise<{ success: boolean; agent?: any; error?: string }>
  codexSendMessage: (workspaceId: string, message: string) => Promise<{ success: boolean; response?: any; error?: string }>
  codexGetAgentStatus: (workspaceId: string) => Promise<{ success: boolean; agent?: any; error?: string }>
  codexGetAllAgents: () => Promise<{ success: boolean; agents?: any[]; error?: string }>
  codexRemoveAgent: (workspaceId: string) => Promise<{ success: boolean; removed?: boolean; error?: string }>
  codexGetInstallationInstructions: () => Promise<{ success: boolean; instructions?: string; error?: string }>
}
