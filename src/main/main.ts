import { app, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createMainWindow } from './app/window'
import { registerAppLifecycle } from './app/lifecycle'
import { registerAllIpc } from './ipc'
import { databaseService } from './services/DatabaseService'

// App bootstrap
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'emdash.icns')
      : join(__dirname, '..', '..', 'src', 'assets', 'images', 'emdash', 'emdash.icns')

    let dockIcon: Electron.NativeImage | undefined

    if (existsSync(iconPath)) {
      dockIcon = nativeImage.createFromPath(iconPath)

      if (dockIcon.isEmpty()) {
        try {
          dockIcon = nativeImage.createFromBuffer(readFileSync(iconPath))
        } catch {
          dockIcon = undefined
        }
      }
    }

    if (!dockIcon || dockIcon.isEmpty()) {
      const fallbackIconPath = join(
        __dirname,
        '..',
        '..',
        'src',
        'assets',
        'images',
        'emdash',
        'emdash_dev.png',
      )
      if (existsSync(fallbackIconPath)) {
        const fallbackIcon = nativeImage.createFromPath(fallbackIconPath)
        if (!fallbackIcon.isEmpty()) {
          dockIcon = fallbackIcon
        }
      }
    }

    if (dockIcon && !dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon)
    }
  }

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
