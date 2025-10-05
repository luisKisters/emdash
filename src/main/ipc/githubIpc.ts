import { ipcMain } from 'electron';
import { GitHubService } from '../services/GitHubService';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const githubService = new GitHubService();

export function registerGithubIpc() {
  ipcMain.handle('github:connect', async (_, projectPath: string) => {
    try {
      // Check if GitHub CLI is authenticated
      const isAuth = await githubService.isAuthenticated();
      if (!isAuth) {
        return { success: false, error: 'GitHub CLI not authenticated' };
      }

      // Get repository info from GitHub CLI
      try {
        const { stdout } = await execAsync(
          'gh repo view --json name,nameWithOwner,defaultBranchRef',
          { cwd: projectPath }
        );
        const repoInfo = JSON.parse(stdout);

        return {
          success: true,
          repository: repoInfo.nameWithOwner,
          branch: repoInfo.defaultBranchRef?.name || 'main',
        };
      } catch (error) {
        return {
          success: false,
          error: 'Repository not found on GitHub or not connected to GitHub CLI',
        };
      }
    } catch (error) {
      console.error('Failed to connect to GitHub:', error);
      return { success: false, error: 'Failed to connect to GitHub' };
    }
  });

  ipcMain.handle('github:auth', async () => {
    try {
      return await githubService.authenticate();
    } catch (error) {
      console.error('GitHub authentication failed:', error);
      return { success: false, error: 'Authentication failed' };
    }
  });

  ipcMain.handle('github:isAuthenticated', async () => {
    try {
      return await githubService.isAuthenticated();
    } catch (error) {
      console.error('GitHub authentication check failed:', error);
      return false;
    }
  });

  // GitHub status: installed + authenticated + user
  ipcMain.handle('github:getStatus', async () => {
    try {
      let installed = true;
      try {
        await execAsync('gh --version');
      } catch {
        installed = false;
      }

      let authenticated = false;
      let user: any = null;
      if (installed) {
        try {
          const { stdout } = await execAsync('gh api user');
          user = JSON.parse(stdout);
          authenticated = true;
        } catch {
          authenticated = false;
          user = null;
        }
      }

      return { installed, authenticated, user };
    } catch (error) {
      console.error('GitHub status check failed:', error);
      return { installed: false, authenticated: false };
    }
  });

  ipcMain.handle('github:getUser', async () => {
    try {
      const token = await (githubService as any)['getStoredToken']();
      if (!token) return null;
      return await githubService.getUserInfo(token);
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  });

  ipcMain.handle('github:getRepositories', async () => {
    try {
      const token = await (githubService as any)['getStoredToken']();
      if (!token) throw new Error('Not authenticated');
      return await githubService.getRepositories(token);
    } catch (error) {
      console.error('Failed to get repositories:', error);
      return [];
    }
  });

  ipcMain.handle('github:cloneRepository', async (_, repoUrl: string, localPath: string) => {
    try {
      return await githubService.cloneRepository(repoUrl, localPath);
    } catch (error) {
      console.error('Failed to clone repository:', error);
      return { success: false, error: 'Clone failed' };
    }
  });

  ipcMain.handle('github:logout', async () => {
    try {
      await githubService.logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  });
}
