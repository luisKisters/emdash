import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { SshExecutionContext } from '@main/core/execution-context/ssh-execution-context';
import type { IExecutionContext } from '@main/core/execution-context/types';
import type { MachineRef } from '@main/core/runtime/types';
import { sshConnectionManager } from '@main/core/ssh/lifecycle/production-ssh-connection-manager';
import { taskSessionManager } from '@main/core/tasks/task-session-manager';
import { workspaceRegistry } from '@main/core/workspaces/workspace-registry';

export interface LoopExecutionTarget {
  workspaceId: string;
  path: string;
  machine: MachineRef;
  ctx: IExecutionContext;
}

/**
 * Resolves a loop's task to its workspace + an execution context to run commands
 * in. Mirrors the resolution in `conversations/hydrateConversation.ts`: workspace
 * from `taskSessionManager.getWorkspaceId`, machine from the task's SSH connection.
 */
export async function resolveLoopExecutionTarget(taskId: string): Promise<LoopExecutionTarget> {
  const workspaceId = taskSessionManager.getWorkspaceId(taskId);
  if (!workspaceId) throw new Error('No workspace found for task');
  const workspace = workspaceRegistry.get(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const connId = taskSessionManager.getPersistData(taskId)?.sshConnectionId;
  const machine: MachineRef = connId ? { kind: 'ssh', connectionId: connId } : { kind: 'local' };

  const ctx =
    machine.kind === 'ssh'
      ? new SshExecutionContext(await sshConnectionManager.connect(machine.connectionId), {
          root: workspace.path,
        })
      : new LocalExecutionContext({ root: workspace.path });

  return { workspaceId, path: workspace.path, machine, ctx };
}
