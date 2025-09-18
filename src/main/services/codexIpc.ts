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

  // Get per-file diff
  ipcMain.handle(
    "git:get-file-diff",
    async (event, args: { workspacePath: string; filePath: string }) => {
      try {
        const { workspacePath, filePath } = args
        const diff = await getFileDiff(workspacePath, filePath)
        return { success: true, diff }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    }
  )

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
    // Preserve leading spaces in porcelain output; they are significant
    const statusLines = statusOutput
      .split("\n")
      .map((l) => l.replace(/\r$/, ""))
      .filter((l) => l.length > 0);

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

// Get per-file diff (HEAD vs working tree) for a specific file
export async function getFileDiff(
  workspacePath: string,
  filePath: string
): Promise<{
  lines: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }>
}> {
  // Use unified diff from HEAD to working tree to include staged + unstaged
  const cmd = `git diff --no-color --unified=2000 HEAD -- "${filePath}"`
  try {
    const { stdout } = await execAsync(cmd, { cwd: workspacePath })
    const linesRaw = stdout.split("\n")
    const result: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }> = []

    // Parse unified diff: skip headers (diff --, index, ---/+++), parse hunks @@
    for (const line of linesRaw) {
      if (!line) continue
      if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@')) {
        continue
      }
      const prefix = line[0]
      const content = line.slice(1)
      if (prefix === ' ') {
        result.push({ left: content, right: content, type: 'context' })
      } else if (prefix === '-') {
        result.push({ left: content, type: 'del' })
      } else if (prefix === '+') {
        result.push({ right: content, type: 'add' })
      } else {
        // Fallback treat as context
        result.push({ left: line, right: line, type: 'context' })
      }
    }

    // If parsing yielded no content (e.g., brand-new file or edge case), fall back gracefully
    if (result.length === 0) {
      try {
        const fs = require('fs') as typeof import('fs')
        const p = require('path') as typeof import('path')
        const abs = p.join(workspacePath, filePath)
        if (fs.existsSync(abs)) {
          const content = fs.readFileSync(abs, 'utf8')
          return { lines: content.split('\n').map((l: string) => ({ right: l, type: 'add' as const })) }
        } else {
          // File missing in working tree: try to show previous content from HEAD as deletions
          try {
            const { stdout: prev } = await execAsync(`git show HEAD:"${filePath}"`, { cwd: workspacePath })
            return { lines: prev.split('\n').map((l: string) => ({ left: l, type: 'del' as const })) }
          } catch {
            return { lines: [] }
          }
        }
      } catch {
        // ignore and return empty
      }
    }

    return { lines: result }
  } catch (error) {
    // If the file is untracked, show full content as additions
    try {
      const { stdout: cat } = await execAsync(`cat -- "${filePath}"`, { cwd: workspacePath })
      const lines = cat.split('\n')
      return {
        lines: lines.map((l) => ({ right: l, type: 'add' as const }))
      }
    } catch (e) {
      // Deleted file or inaccessible: try diff cached vs HEAD
      try {
        const { stdout } = await execAsync(`git diff --no-color --unified=2000 HEAD -- "${filePath}"`, { cwd: workspacePath })
        const linesRaw = stdout.split('\n')
        const result: Array<{ left?: string; right?: string; type: 'context' | 'add' | 'del' }> = []
        for (const line of linesRaw) {
          if (!line) continue
          if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@')) continue
          const prefix = line[0]
          const content = line.slice(1)
          if (prefix === ' ') result.push({ left: content, right: content, type: 'context' })
          else if (prefix === '-') result.push({ left: content, type: 'del' })
          else if (prefix === '+') result.push({ right: content, type: 'add' })
          else result.push({ left: line, right: line, type: 'context' })
        }
        if (result.length === 0) {
          // As a last resort, try to show HEAD content as deletions
          try {
            const { stdout: prev } = await execAsync(`git show HEAD:"${filePath}"`, { cwd: workspacePath })
            return { lines: prev.split('\n').map((l: string) => ({ left: l, type: 'del' as const })) }
          } catch {
            return { lines: [] }
          }
        }
        return { lines: result }
      } catch {
        return { lines: [] }
      }
    }
  }
}
