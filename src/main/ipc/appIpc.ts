import { app, ipcMain, shell } from 'electron';

export function registerAppIpc() {
  // Open external links in default browser
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    try {
      if (!url || typeof url !== 'string') throw new Error('Invalid URL');
      await shell.openExternal(url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  // App metadata
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPlatform', () => process.platform);
}
