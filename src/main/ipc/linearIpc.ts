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

  ipcMain.handle('linear:getIssues', async (_event, identifiers: string[]) => {
    if (!Array.isArray(identifiers)) {
      return { success: false, error: 'Issue identifiers must be provided as an array.' };
    }

    try {
      const issues = await linearService.fetchIssues(identifiers);
      return { success: true, issues };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fetch issues from Linear at this time.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('linear:searchIssues', async (_event, term: string, limit?: number) => {
    if (!term || typeof term !== 'string') {
      return { success: false, error: 'Search term is required.' };
    }

    try {
      const issues = await linearService.searchIssues(term, limit ?? 10);
      return { success: true, issues };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to search Linear issues right now.';
      return { success: false, error: message };
    }
  });
}

export default registerLinearIpc;
