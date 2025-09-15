import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { isDev } from './utils/dev'

import { GitHubService } from './services/GitHubService'
import { databaseService } from './services/DatabaseService'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'

const execAsync = promisify(exec)
import { registerPtyIpc } from './services/ptyIpc'
import { registerWorktreeIpc } from './services/worktreeIpc'
import { setupCodexIpc } from './services/codexIpc'

let mainWindow: BrowserWindow | null = null
const githubService = new GitHubService()

const createWindow = (): void => {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App event handlers
app.whenReady().then(async () => {
  // Initialize database
  try {
    await databaseService.initialize()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // Register PTY IPC handlers
  registerPtyIpc()
  
  // Register worktree IPC handlers
  registerWorktreeIpc()
  
  // Register Codex IPC handlers
  setupCodexIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handlers
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPlatform', () => {
  return process.platform
})

// Project management
ipcMain.handle('project:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Project',
      properties: ['openDirectory'],
      message: 'Select a project directory to open',
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'No directory selected' }
    }
    
    const projectPath = result.filePaths[0]
    return { success: true, path: projectPath }
  } catch (error) {
    console.error('Failed to open project:', error)
    return { success: false, error: 'Failed to open project directory' }
  }
})

ipcMain.handle('git:getInfo', async (_, projectPath: string) => {
  try {
    const gitPath = join(projectPath, '.git')
    const isGitRepo = fs.existsSync(gitPath)
    
    if (!isGitRepo) {
      return { isGitRepo: false }
    }
    
    // Get remote URL
    let remote: string | null = null
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: projectPath })
      remote = stdout.trim()
    } catch (error) {
      // No origin remote or git error
    }
    
    // Get current branch
    let branch: string | null = null
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath })
      branch = stdout.trim()
    } catch (error) {
      // Git error
    }
    
    return {
      isGitRepo: true,
      remote,
      branch,
      path: projectPath
    }
  } catch (error) {
    console.error('Failed to get Git info:', error)
    return { isGitRepo: false, error: 'Failed to read Git information' }
  }
})

ipcMain.handle('github:connect', async (_, projectPath: string) => {
  try {
    // Check if GitHub CLI is authenticated
    const isAuth = await githubService.isAuthenticated()
    if (!isAuth) {
      return { success: false, error: 'GitHub CLI not authenticated' }
    }
    
    // Get repository info from GitHub CLI
    try {
      const { stdout } = await execAsync('gh repo view --json name,nameWithOwner,defaultBranchRef', { cwd: projectPath })
      const repoInfo = JSON.parse(stdout)
      
      return {
        success: true,
        repository: repoInfo.nameWithOwner,
        branch: repoInfo.defaultBranchRef?.name || 'main'
      }
    } catch (error) {
      return { 
        success: false, 
        error: 'Repository not found on GitHub or not connected to GitHub CLI' 
      }
    }
  } catch (error) {
    console.error('Failed to connect to GitHub:', error)
    return { success: false, error: 'Failed to connect to GitHub' }
  }
})

// Repository management
ipcMain.handle('repos:scan', async () => {
  // TODO: Implement repository scanning
  return []
})

ipcMain.handle('repos:add', async (_, path: string) => {
  // TODO: Implement repository addition
  console.log('Adding repository:', path)
  return { id: 'mock-repo', path, origin: 'mock-origin', defaultBranch: 'main' }
})

// Run management
ipcMain.handle('runs:create', async (_, config: any) => {
  // TODO: Implement run creation
  console.log('Creating run:', config)
  return 'mock-run-id'
})

ipcMain.handle('runs:cancel', async (_, runId: string) => {
  // TODO: Implement run cancellation
  console.log('Cancelling run:', runId)
})

ipcMain.handle('runs:diff', async (_, runId: string) => {
  // TODO: Implement diff generation
  console.log('Getting diff for run:', runId)
  return { patch: '', stats: {} }
})

// GitHub integration
ipcMain.handle('github:auth', async () => {
  try {
    return await githubService.authenticate()
  } catch (error) {
    console.error('GitHub authentication failed:', error)
    return { success: false, error: 'Authentication failed' }
  }
})

ipcMain.handle('github:isAuthenticated', async () => {
  try {
    return await githubService.isAuthenticated()
  } catch (error) {
    console.error('GitHub authentication check failed:', error)
    return false
  }
})

ipcMain.handle('github:getUser', async () => {
  try {
    const token = await githubService['getStoredToken']()
    if (!token) return null
    return await githubService.getUserInfo(token)
  } catch (error) {
    console.error('Failed to get user info:', error)
    return null
  }
})

ipcMain.handle('github:getRepositories', async () => {
  try {
    const token = await githubService['getStoredToken']()
    if (!token) throw new Error('Not authenticated')
    return await githubService.getRepositories(token)
  } catch (error) {
    console.error('Failed to get repositories:', error)
    return []
  }
})

ipcMain.handle('github:cloneRepository', async (_, repoUrl: string, localPath: string) => {
  try {
    return await githubService.cloneRepository(repoUrl, localPath)
  } catch (error) {
    console.error('Failed to clone repository:', error)
    return { success: false, error: 'Clone failed' }
  }
})

ipcMain.handle('github:logout', async () => {
  try {
    await githubService.logout()
  } catch (error) {
    console.error('Failed to logout:', error)
  }
})

// Settings
ipcMain.handle('settings:get', async () => {
  return {
    defaultProvider: 'claude-code',
    maxConcurrentRuns: 3
  }
})

ipcMain.handle('settings:update', async (_, settings: any) => {
  // TODO: Implement settings persistence
  console.log('Updating settings:', settings)
})

// Database IPC handlers
ipcMain.handle('db:getProjects', async () => {
  try {
    return await databaseService.getProjects()
  } catch (error) {
    console.error('Failed to get projects:', error)
    return []
  }
})

ipcMain.handle('db:saveProject', async (_, project: any) => {
  try {
    await databaseService.saveProject(project)
    return { success: true }
  } catch (error) {
    console.error('Failed to save project:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:getWorkspaces', async (_, projectId?: string) => {
  try {
    return await databaseService.getWorkspaces(projectId)
  } catch (error) {
    console.error('Failed to get workspaces:', error)
    return []
  }
})

ipcMain.handle('db:saveWorkspace', async (_, workspace: any) => {
  try {
    await databaseService.saveWorkspace(workspace)
    return { success: true }
  } catch (error) {
    console.error('Failed to save workspace:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:deleteProject', async (_, projectId: string) => {
  try {
    await databaseService.deleteProject(projectId)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete project:', error)
    return { success: false, error: (error as Error).message }
  }
})

// Conversation management IPC handlers
ipcMain.handle('db:saveConversation', async (_, conversation: any) => {
  try {
    await databaseService.saveConversation(conversation)
    return { success: true }
  } catch (error) {
    console.error('Failed to save conversation:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:getConversations', async (_, workspaceId: string) => {
  try {
    const conversations = await databaseService.getConversations(workspaceId)
    return { success: true, conversations }
  } catch (error) {
    console.error('Failed to get conversations:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:getOrCreateDefaultConversation', async (_, workspaceId: string) => {
  try {
    const conversation = await databaseService.getOrCreateDefaultConversation(workspaceId)
    return { success: true, conversation }
  } catch (error) {
    console.error('Failed to get or create default conversation:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:saveMessage', async (_, message: any) => {
  try {
    await databaseService.saveMessage(message)
    return { success: true }
  } catch (error) {
    console.error('Failed to save message:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:getMessages', async (_, conversationId: string) => {
  try {
    const messages = await databaseService.getMessages(conversationId)
    return { success: true, messages }
  } catch (error) {
    console.error('Failed to get messages:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:deleteConversation', async (_, conversationId: string) => {
  try {
    await databaseService.deleteConversation(conversationId)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete conversation:', error)
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('db:deleteWorkspace', async (_, workspaceId: string) => {
  try {
    await databaseService.deleteWorkspace(workspaceId)
    return { success: true }
  } catch (error) {
    console.error('Failed to delete workspace:', error)
    return { success: false, error: (error as Error).message }
  }
})
