import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface CodexAgent {
  id: string;
  workspaceId: string;
  worktreePath: string;
  status: 'idle' | 'running' | 'error';
  lastMessage?: string;
  lastResponse?: string;
}

export interface CodexResponse {
  success: boolean;
  output?: string;
  error?: string;
  agentId: string;
}

export class CodexService {
  private agents: Map<string, CodexAgent> = new Map();
  private isCodexInstalled: boolean | null = null;

  constructor() {
    this.checkCodexInstallation();
  }

  /**
   * Check if Codex CLI is installed
   */
  private async checkCodexInstallation(): Promise<boolean> {
    try {
      await execAsync('codex --version');
      this.isCodexInstalled = true;
      console.log('Codex CLI is installed');
      return true;
    } catch (error) {
      this.isCodexInstalled = false;
      console.log('Codex CLI is not installed');
      return false;
    }
  }

  /**
   * Get installation status
   */
  public async getInstallationStatus(): Promise<boolean> {
    if (this.isCodexInstalled === null) {
      return await this.checkCodexInstallation();
    }
    return this.isCodexInstalled;
  }

  /**
   * Create a new Codex agent for a workspace
   */
  public async createAgent(workspaceId: string, worktreePath: string): Promise<CodexAgent> {
    const agentId = `agent-${workspaceId}-${Date.now()}`;
    
    const agent: CodexAgent = {
      id: agentId,
      workspaceId,
      worktreePath,
      status: 'idle'
    };

    this.agents.set(agentId, agent);
    console.log(`Created Codex agent ${agentId} for workspace ${workspaceId}`);
    
    return agent;
  }

  /**
   * Send a message to a Codex agent
   */
  public async sendMessage(workspaceId: string, message: string): Promise<CodexResponse> {
    // Find agent for this workspace
    const agent = Array.from(this.agents.values()).find(a => a.workspaceId === workspaceId);
    
    if (!agent) {
      return {
        success: false,
        error: 'No agent found for this workspace',
        agentId: ''
      };
    }

    if (!this.isCodexInstalled) {
      return {
        success: false,
        error: 'Codex CLI is not installed. Please install it with: npm install -g @openai/codex',
        agentId: agent.id
      };
    }

    // Update agent status
    agent.status = 'running';
    agent.lastMessage = message;

    try {
      // Use exec with workspace-write sandbox (allows file modifications)
      const command = `codex exec --sandbox workspace-write "${message.replace(/"/g, '\\"')}"`;
      console.log(`Executing: ${command} in ${agent.worktreePath}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: agent.worktreePath,
        timeout: 60000 // 60 second timeout
      });

      agent.status = 'idle';
      agent.lastResponse = stdout;

      console.log(`Codex completed in ${agent.worktreePath}`);
      console.log('Codex stdout:', stdout);
      console.log('Codex stderr:', stderr);

      return {
        success: true,
        output: stdout,
        agentId: agent.id
      };

    } catch (error: any) {
      agent.status = 'error';
      
      let errorMessage = 'Unknown error occurred';
      if (error.code === 'ENOENT') {
        errorMessage = 'Codex CLI not found. Please install it with: npm install -g @openai/codex';
      } else if (error.code === 'TIMEOUT') {
        errorMessage = 'Codex command timed out';
      } else if (error.stderr) {
        errorMessage = error.stderr;
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.error(`Error executing Codex in ${agent.worktreePath}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        agentId: agent.id
      };
    }
  }


  /**
   * Get agent status
   */
  public getAgentStatus(workspaceId: string): CodexAgent | null {
    return Array.from(this.agents.values()).find(a => a.workspaceId === workspaceId) || null;
  }

  /**
   * Get all agents
   */
  public getAllAgents(): CodexAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Remove an agent
   */
  public removeAgent(workspaceId: string): boolean {
    const agent = Array.from(this.agents.values()).find(a => a.workspaceId === workspaceId);
    if (agent) {
      this.agents.delete(agent.id);
      console.log(`Removed agent ${agent.id} for workspace ${workspaceId}`);
      return true;
    }
    return false;
  }

  /**
   * Get installation instructions
   */
  public getInstallationInstructions(): string {
    return `To install Codex CLI, run one of these commands:

npm install -g @openai/codex

or

brew install codex

After installation, authenticate with:
codex

Then try again!`;
  }
}

// Singleton instance
export const codexService = new CodexService();
