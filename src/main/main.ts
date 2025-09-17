import { app } from 'electron'
import { createMainWindow } from './app/window'
import { registerAppLifecycle } from './app/lifecycle'
import { registerAllIpc } from './ipc'
import { databaseService } from './services/DatabaseService'

// App bootstrap
app.whenReady().then(async () => {
  // Initialize database
  try {
    await databaseService.initialize()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
  }

  // Register IPC handlers
  registerAllIpc()

  // Create main window
  createMainWindow()
})

// App lifecycle handlers
registerAppLifecycle()

