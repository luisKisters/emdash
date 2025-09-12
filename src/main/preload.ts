import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  
  // Repository management
  scanRepos: () => ipcRenderer.invoke('repos:scan'),
  addRepo: (path: string) => ipcRenderer.invoke('repos:add', path),
  
  // Run management
  createRun: (config: any) => ipcRenderer.invoke('runs:create', config),
  cancelRun: (runId: string) => ipcRenderer.invoke('runs:cancel', runId),
  getRunDiff: (runId: string) => ipcRenderer.invoke('runs:diff', runId),
  
  // GitHub integration
  githubAuth: () => ipcRenderer.invoke('github:auth'),
  createPR: (config: any) => ipcRenderer.invoke('github:createPR', config),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: any) => ipcRenderer.invoke('settings:update', settings),
})

// Type definitions for the exposed API
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  // Repository management
  scanRepos: () => Promise<any[]>
  addRepo: (path: string) => Promise<any>
  
  // Run management
  createRun: (config: any) => Promise<string>
  cancelRun: (runId: string) => Promise<void>
  getRunDiff: (runId: string) => Promise<any>
  
  // GitHub integration
  githubAuth: () => Promise<any>
  createPR: (config: any) => Promise<string>
  
  // Settings
  getSettings: () => Promise<any>
  updateSettings: (settings: any) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}