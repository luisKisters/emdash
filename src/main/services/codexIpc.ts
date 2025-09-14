import { ipcMain } from 'electron';
import { codexService, CodexAgent } from './CodexService';

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

  console.log('✅ Codex IPC handlers registered');
}
