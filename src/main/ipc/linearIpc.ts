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

  ipcMain.handle('linear:listIssues', async (_event, limit?: number) => {
    // console.log('[Linear IPC] listIssues requested', {
    //   limit: typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
    //   timestamp: new Date().toISOString(),
    // });
    try {
      const issues = await linearService.listIssues(
        typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined
      );
      // console.log('[Linear IPC] listIssues succeeded', {
      //   count: Array.isArray(issues) ? issues.length : null,
      //   timestamp: new Date().toISOString(),
      // });
      return { success: true, issues };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load Linear issues right now.';
      // console.error('[Linear IPC] listIssues failed', {
      //   error: message,
      //   originalError: error,
      //   timestamp: new Date().toISOString(),
      // });
      return { success: false, error: message };
    }
  });

  ipcMain.handle('linear:getIssue', async (_event, identifier: string) => {
    if (!identifier || typeof identifier !== 'string') {
      return { success: false, error: 'Issue identifier is required.' };
    }
    try {
      const issue = await linearService.fetchIssueByIdentifier(identifier);
      return { success: true, issue };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to fetch Linear issue at this time.';
      return { success: false, error: message };
    }
  });
}

export default registerLinearIpc;
