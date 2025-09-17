import { ipcMain } from 'electron';
import { codexService, CodexAgent } from './CodexService';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export function setupCodexIpc() {
  // Check if Codex is installed
  ipcMain.handle('codex:check-installation', async () => {
    try {
      const isInstalled = await codexService.getInstallationStatus();
      return { success: true, isInstalled };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Create a new agent for a workspace
  ipcMain.handle('codex:create-agent', async (event, workspaceId: string, worktreePath: string) => {
    try {
      const agent = await codexService.createAgent(workspaceId, worktreePath);
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Send a message to Codex
  ipcMain.handle('codex:send-message', async (event, workspaceId: string, message: string) => {
    try {
      const response = await codexService.sendMessage(workspaceId, message);
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Send a message to Codex with streaming
  ipcMain.handle('codex:send-message-stream', async (event, workspaceId: string, message: string) => {
    try {
      await codexService.sendMessageStream(workspaceId, message);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('codex:stop-stream', async (event, workspaceId: string) => {
    try {
      console.log('[codex:stop-stream] request received', workspaceId);
      const stopped = await codexService.stopMessageStream(workspaceId);
      console.log('[codex:stop-stream] result', { workspaceId, stopped });
      return { success: stopped, stopped };
    } catch (error) {
      console.error('[codex:stop-stream] failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get agent status
  ipcMain.handle('codex:get-agent-status', async (event, workspaceId: string) => {
    try {
      const agent = codexService.getAgentStatus(workspaceId);
      return { success: true, agent };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get all agents
  ipcMain.handle('codex:get-all-agents', async () => {
    try {
      const agents = codexService.getAllAgents();
      return { success: true, agents };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Remove an agent
  ipcMain.handle('codex:remove-agent', async (event, workspaceId: string) => {
    try {
      const removed = codexService.removeAgent(workspaceId);
      return { success: true, removed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Get installation instructions
  ipcMain.handle('codex:get-installation-instructions', async () => {
    try {
      const instructions = codexService.getInstallationInstructions();
      return { success: true, instructions };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Set up event listeners for streaming
  codexService.on('codex:output', (data) => {
    // Broadcast to all renderer processes
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('codex:stream-output', data);
    });
  });

  codexService.on('codex:error', (data) => {
    // Broadcast to all renderer processes
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('codex:stream-error', data);
    });
  });

  codexService.on('codex:complete', (data) => {
    // Broadcast to all renderer processes
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send('codex:stream-complete', data);
    });
  });

  // Get git status for a workspace
  ipcMain.handle('git:get-status', async (event, workspacePath: string) => {
    try {
      const gitStatus = await getGitStatus(workspacePath);
      return { success: true, changes: gitStatus };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  console.log('✅ Codex IPC handlers registered');
}

// Helper function to get git status
async function getGitStatus(workspacePath: string): Promise<Array<{ path: string; status: string; additions: number; deletions: number; diff?: string }>> {
  try {
    // Check if the directory is a git repository
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: workspacePath });
    } catch (error) {
      // Not a git repository
      return [];
    }

    // Get git status in porcelain format
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: workspacePath });
    
    if (!statusOutput.trim()) {
      return [];
    }

    const changes: Array<{ path: string; status: string; additions: number; deletions: number; diff?: string }> = [];
    const statusLines = statusOutput.trim().split('\n');

    for (const line of statusLines) {
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);
      
      // Parse status code
      let status = 'modified';
      if (statusCode.includes('A')) {
        status = 'added';
      } else if (statusCode.includes('D')) {
        status = 'deleted';
      } else if (statusCode.includes('R')) {
        status = 'renamed';
      } else if (statusCode.includes('M')) {
        status = 'modified';
      }

      // Get diff statistics for the file
      let additions = 0;
      let deletions = 0;
      
      try {
        const { stdout: diffStats } = await execAsync(`git diff --stat --cached -- "${filePath}"`, { cwd: workspacePath });
        if (diffStats.trim()) {
          const stats = parseDiffStats(diffStats);
          additions = stats.additions;
          deletions = stats.deletions;
        } else {
          // Check unstaged changes
          const { stdout: unstagedStats } = await execAsync(`git diff --stat -- "${filePath}"`, { cwd: workspacePath });
          if (unstagedStats.trim()) {
            const stats = parseDiffStats(unstagedStats);
            additions = stats.additions;
            deletions = stats.deletions;
          }
        }
      } catch (diffError) {
        // If diff fails, just use 0 for stats
        console.warn(`Failed to get diff stats for ${filePath}:`, diffError);
      }

      changes.push({
        path: filePath,
        status,
        additions,
        deletions,
      });
    }

    return changes;
  } catch (error) {
    console.error('Error getting git status:', error);
    throw error;
  }
}

// Helper function to parse git diff --stat output
function parseDiffStats(diffOutput: string): { additions: number; deletions: number } {
  const lines = diffOutput.trim().split('\n');
  const lastLine = lines[lines.length - 1];
  
  // Parse the summary line like " 2 files changed, 3 insertions(+), 1 deletion(-)"
  const match = lastLine.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
  
  if (match) {
    return {
      additions: parseInt(match[1], 10),
      deletions: parseInt(match[2], 10),
    };
  }
  
  // Fallback: try to parse individual file stats
  let totalAdditions = 0;
  let totalDeletions = 0;
  
  for (const line of lines) {
    const fileMatch = line.match(/\|\s*(\d+)\s*[+-]*\s*(\d+)\s*[+-]*/);
    if (fileMatch) {
      totalAdditions += parseInt(fileMatch[1], 10);
      totalDeletions += parseInt(fileMatch[2], 10);
    }
  }
  
  return {
    additions: totalAdditions,
    deletions: totalDeletions,
  };
}
