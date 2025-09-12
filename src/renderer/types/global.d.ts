// Global type declarations for Electron API
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      scanRepos: () => Promise<any[]>
      addRepo: (path: string) => Promise<any>
      createRun: (config: any) => Promise<string>
      cancelRun: (runId: string) => Promise<void>
      getRunDiff: (runId: string) => Promise<any>
      onRunEvent: (callback: (event: any) => void) => void
      removeRunEventListeners: () => void
      githubAuth: () => Promise<{ success: boolean; token?: string; user?: any; error?: string }>
      githubIsAuthenticated: () => Promise<boolean>
      githubGetUser: () => Promise<any>
      githubGetRepositories: () => Promise<any[]>
      githubCloneRepository: (repoUrl: string, localPath: string) => Promise<{ success: boolean; error?: string }>
      githubLogout: () => Promise<void>
      getSettings: () => Promise<any>
      updateSettings: (settings: any) => Promise<void>
    }
  }
}

export {}
