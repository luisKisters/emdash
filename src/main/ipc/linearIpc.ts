import { ipcMain } from 'electron';
import LinearService from '../services/LinearService';

const linearService = new LinearService();

export function registerLinearIpc() {
  ipcMain.handle('linear:saveToken', async (_event, token: string) => {
    if (!token || typeof token !== 'string') {
      return { success: false, error: 'A Linear API token is required.' };
    }

    return linearService.saveToken(token);
  });

  ipcMain.handle('linear:checkConnection', async () => {
    return linearService.checkConnection();
  });

  ipcMain.handle('linear:clearToken', async () => {
    return linearService.clearToken();
  });

  ipcMain.handle('linear:initialFetch', async (_event, limit?: number) => {
    // console.log('[Linear IPC] listIssues requested', {
    //   limit: typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
    //   timestamp: new Date().toISOString(),
    // });
    try {
      const issues = await linearService.initialFetch(
        typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined
      );
      // console.log('[Linear IPC] listIssues succeeded', {
      //   count: Array.isArray(issues) ? issues.length : null,
      //   timestamp: new Date().toISOString(),
      // });
      return { success: true, issues };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fetch initial Linear issues right now.';
      // console.error('[Linear IPC] listIssues failed', {
      //   error: message,
      //   originalError: error,
      //   timestamp: new Date().toISOString(),
      // });
      return { success: false, error: message };
    }
  });
}

export default registerLinearIpc;
