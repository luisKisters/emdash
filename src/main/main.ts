import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { isDev } from './utils/dev'

let mainWindow: BrowserWindow | null = null

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
app.whenReady().then(() => {
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
  // TODO: Implement GitHub OAuth Device Flow
  console.log('GitHub auth requested')
  return { token: 'mock-token' }
})

ipcMain.handle('github:createPR', async (_, config: any) => {
  // TODO: Implement PR creation
  console.log('Creating PR:', config)
  return 'https://github.com/mock/repo/pull/1'
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