import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  
  // PTY management
  ptyStart: (opts: { id: string; cwd?: string; shell?: string; env?: Record<string, string>; cols?: number; rows?: number; }) =>
    ipcRenderer.invoke('pty:start', opts),
  ptyInput: (args: { id: string; data: string }) =>
    ipcRenderer.send('pty:input', args),
  ptyResize: (args: { id: string; cols: number; rows: number }) =>
    ipcRenderer.send('pty:resize', args),
  ptyKill: (id: string) => ipcRenderer.send('pty:kill', { id }),
  
  onPtyData: (id: string, listener: (data: string) => void) => {
    const channel = `pty:data:${id}`
    const wrapped = (_: Electron.IpcRendererEvent, data: string) => listener(data)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  onPtyExit: (id: string, listener: (info: { exitCode: number; signal?: number }) => void) => {
    const channel = `pty:exit:${id}`
    const wrapped = (_: Electron.IpcRendererEvent, info: { exitCode: number; signal?: number }) => listener(info)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },

  // Project management
  openProject: () => ipcRenderer.invoke('project:open'),
  getGitInfo: (projectPath: string) => ipcRenderer.invoke('git:getInfo', projectPath),
  connectToGitHub: (projectPath: string) => ipcRenderer.invoke('github:connect', projectPath),
  
  // Repository management
  scanRepos: () => ipcRenderer.invoke('repos:scan'),
  addRepo: (path: string) => ipcRenderer.invoke('repos:add', path),
  
  // Run management
  createRun: (config: any) => ipcRenderer.invoke('runs:create', config),
  cancelRun: (runId: string) => ipcRenderer.invoke('runs:cancel', runId),
  getRunDiff: (runId: string) => ipcRenderer.invoke('runs:diff', runId),
  onRunEvent: (callback: (event: any) => void) => {
    ipcRenderer.on('run:event', (_, event) => callback(event))
  },
  removeRunEventListeners: () => {
    ipcRenderer.removeAllListeners('run:event')
  },
  
  // GitHub integration
  githubAuth: () => ipcRenderer.invoke('github:auth'),
  githubIsAuthenticated: () => ipcRenderer.invoke('github:isAuthenticated'),
  githubGetUser: () => ipcRenderer.invoke('github:getUser'),
  githubGetRepositories: () => ipcRenderer.invoke('github:getRepositories'),
  githubCloneRepository: (repoUrl: string, localPath: string) => ipcRenderer.invoke('github:cloneRepository', repoUrl, localPath),
  githubLogout: () => ipcRenderer.invoke('github:logout'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: any) => ipcRenderer.invoke('settings:update', settings),
  
  // Database methods
  getProjects: () => ipcRenderer.invoke('db:getProjects'),
  saveProject: (project: any) => ipcRenderer.invoke('db:saveProject', project),
  getWorkspaces: (projectId?: string) => ipcRenderer.invoke('db:getWorkspaces', projectId),
  saveWorkspace: (workspace: any) => ipcRenderer.invoke('db:saveWorkspace', workspace),
  deleteProject: (projectId: string) => ipcRenderer.invoke('db:deleteProject', projectId),
  deleteWorkspace: (workspaceId: string) => ipcRenderer.invoke('db:deleteWorkspace', workspaceId),
})

// Type definitions for the exposed API
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  // PTY management
  ptyStart: (opts: { id: string; cwd?: string; shell?: string; env?: Record<string, string>; cols?: number; rows?: number; }) => Promise<{ ok: boolean }>
  ptyInput: (args: { id: string; data: string }) => void
  ptyResize: (args: { id: string; cols: number; rows: number }) => void
  ptyKill: (id: string) => void
  onPtyData: (id: string, listener: (data: string) => void) => () => void
  onPtyExit: (id: string, listener: (info: { exitCode: number; signal?: number }) => void) => () => void

  // Project management
  openProject: () => Promise<{ success: boolean; path?: string; error?: string }>
  getGitInfo: (projectPath: string) => Promise<{ isGitRepo: boolean; remote?: string; branch?: string; path?: string; error?: string }>
  connectToGitHub: (projectPath: string) => Promise<{ success: boolean; repository?: string; branch?: string; error?: string }>

  
  // Repository management
  scanRepos: () => Promise<any[]>
  addRepo: (path: string) => Promise<any>
  
  // Run management
  createRun: (config: any) => Promise<string>
  cancelRun: (runId: string) => Promise<void>
  getRunDiff: (runId: string) => Promise<any>
  onRunEvent: (callback: (event: any) => void) => void
  removeRunEventListeners: () => void
  
  // GitHub integration
  githubAuth: () => Promise<{ success: boolean; token?: string; user?: any; error?: string }>
  githubIsAuthenticated: () => Promise<boolean>
  githubGetUser: () => Promise<any>
  githubGetRepositories: () => Promise<any[]>
  githubCloneRepository: (repoUrl: string, localPath: string) => Promise<{ success: boolean; error?: string }>
  githubLogout: () => Promise<void>
  
  // Settings
  getSettings: () => Promise<any>
  updateSettings: (settings: any) => Promise<void>
  
  // Database methods
  getProjects: () => Promise<any[]>
  saveProject: (project: any) => Promise<{ success: boolean; error?: string }>
  getWorkspaces: (projectId?: string) => Promise<any[]>
  saveWorkspace: (workspace: any) => Promise<{ success: boolean; error?: string }>
  deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>
  deleteWorkspace: (workspaceId: string) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
