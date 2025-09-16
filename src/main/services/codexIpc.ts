import { ipcMain } from "electron";
import { codexService, CodexAgent } from "./CodexService";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";

const execAsync = promisify(exec);

export function setupCodexIpc() {
  // Check if Codex is installed
  ipcMain.handle("codex:check-installation", async () => {
    try {
      const isInstalled = await codexService.getInstallationStatus();
      return { success: true, isInstalled };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Create a new agent for a workspace
  ipcMain.handle(
    "codex:create-agent",
    async (event, workspaceId: string, worktreePath: string) => {
      try {
        const agent = await codexService.createAgent(workspaceId, worktreePath);
        return { success: true, agent };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Send a message to Codex
  ipcMain.handle(
    "codex:send-message",
    async (event, workspaceId: string, message: string) => {
      try {
        const response = await codexService.sendMessage(workspaceId, message);
        return { success: true, response };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Send a message to Codex with streaming
  ipcMain.handle(
    "codex:send-message-stream",
    async (event, workspaceId: string, message: string) => {
      try {
        await codexService.sendMessageStream(workspaceId, message);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Get agent status
  ipcMain.handle(
    "codex:get-agent-status",
    async (event, workspaceId: string) => {
      try {
        const agent = codexService.getAgentStatus(workspaceId);
        return { success: true, agent };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Get all agents
  ipcMain.handle("codex:get-all-agents", async () => {
    try {
      const agents = codexService.getAllAgents();
      return { success: true, agents };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Remove an agent
  ipcMain.handle("codex:remove-agent", async (event, workspaceId: string) => {
    try {
      const removed = codexService.removeAgent(workspaceId);
      return { success: true, removed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get installation instructions
  ipcMain.handle("codex:get-installation-instructions", async () => {
    try {
      const instructions = codexService.getInstallationInstructions();
      return { success: true, instructions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Set up event listeners for streaming
  codexService.on("codex:output", (data) => {
    // Broadcast to all renderer processes
    const windows = require("electron").BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send("codex:stream-output", data);
    });
  });

  codexService.on("codex:error", (data) => {
    // Broadcast to all renderer processes
    const windows = require("electron").BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send("codex:stream-error", data);
    });
  });

  codexService.on("codex:complete", (data) => {
    // Broadcast to all renderer processes
    const windows = require("electron").BrowserWindow.getAllWindows();
    windows.forEach((window: any) => {
      window.webContents.send("codex:stream-complete", data);
    });
  });

  // Get git status for a workspace
  ipcMain.handle("git:get-status", async (event, workspacePath: string) => {
    try {
      const gitStatus = await getGitStatus(workspacePath);
      return { success: true, changes: gitStatus };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  console.log("✅ Codex IPC handlers registered");
}

// Helper function to get git status
async function getGitStatus(workspacePath: string): Promise<
  Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
    diff?: string;
  }>
> {
  try {
    // Check if the directory is a git repository
    try {
      await execAsync("git rev-parse --is-inside-work-tree", {
        cwd: workspacePath,
      });
    } catch (error) {
      // Not a git repository
      return [];
    }

    // Get git status in porcelain format (tracks staged + unstaged in a single 2-char code)
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: workspacePath,
    });

    if (!statusOutput.trim()) {
      return [];
    }

    const changes: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
      diff?: string;
    }> = [];
    const statusLines = statusOutput.trim().split("\n");

    for (const line of statusLines) {
      const statusCode = line.substring(0, 2);
      let filePath = line.substring(3);
      // Handle rename lines like: "R  old/path -> new/path"
      if (statusCode.includes("R") && filePath.includes("->")) {
        const parts = filePath.split("->");
        filePath = parts[parts.length - 1].trim();
      }

      // Parse status code
      let status = "modified";
      if (statusCode.includes("A") || statusCode.includes("?")) {
        status = "added";
      } else if (statusCode.includes("D")) {
        status = "deleted";
      } else if (statusCode.includes("R")) {
        status = "renamed";
      } else if (statusCode.includes("M")) {
        status = "modified";
      }

      // Get diff statistics for the file using --numstat (sum staged + unstaged for consistency)
      let additions = 0;
      let deletions = 0;

      // Helper to parse and sum all numstat lines (handles rare multi-line outputs)
      const sumNumstat = (stdout: string) => {
        const lines = stdout
          .trim()
          .split("\n")
          .filter((l) => l.trim().length > 0);
        for (const l of lines) {
          const p = l.split("\t");
          if (p.length >= 2) {
            const addStr = p[0];
            const delStr = p[1];
            const a = addStr === "-" ? 0 : parseInt(addStr, 10) || 0;
            const d = delStr === "-" ? 0 : parseInt(delStr, 10) || 0;
            additions += a;
            deletions += d;
          }
        }
      };

      try {
        // Staged changes relative to HEAD
        const staged = await execAsync(
          `git diff --numstat --cached -- "${filePath}"`,
          { cwd: workspacePath }
        );
        if (staged.stdout && staged.stdout.trim()) {
          sumNumstat(staged.stdout);
        }
      } catch (e) {
        console.warn(`Failed to get staged numstat for ${filePath}:`, e);
      }

      try {
        // Unstaged changes relative to index
        const unstaged = await execAsync(
          `git diff --numstat -- "${filePath}"`,
          { cwd: workspacePath }
        );
        if (unstaged.stdout && unstaged.stdout.trim()) {
          sumNumstat(unstaged.stdout);
        }
      } catch (e) {
        console.warn(`Failed to get unstaged numstat for ${filePath}:`, e);
      }

      // If still nothing and file is untracked, approximate additions as total lines
      if (additions === 0 && deletions === 0 && statusCode.includes("?")) {
        try {
          const { stdout: wc } = await execAsync(`wc -l < "${filePath}"`, {
            cwd: workspacePath,
          });
          additions = parseInt(wc.trim(), 10) || 0;
        } catch (e) {
          console.warn(
            `Failed to count lines for untracked file ${filePath}:`,
            e
          );
        }
      }

      changes.push({ path: filePath, status, additions, deletions });
    }

    return changes;
  } catch (error) {
    console.error("Error getting git status:", error);
    throw error;
  }
}

// Note: --numstat parsing moved inline above for accuracy.
