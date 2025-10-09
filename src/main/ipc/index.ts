import { registerPtyIpc } from '../services/ptyIpc';
import { registerWorktreeIpc } from '../services/worktreeIpc';
import { registerFsIpc } from '../services/fsIpc';
import { setupCodexIpc } from '../services/codexIpc';

import { registerAppIpc } from './appIpc';
import { registerProjectIpc } from './projectIpc';
import { registerGithubIpc } from './githubIpc';
import { registerDatabaseIpc } from './dbIpc';
import { registerDebugIpc } from './debugIpc';
import { registerGitIpc } from './gitIpc';
import { registerAgentIpc } from './agentIpc';
import { registerLinearIpc } from './linearIpc';

export function registerAllIpc() {
  // Core app/utility IPC
  registerAppIpc();
  registerDebugIpc();

  // Domain IPC
  registerProjectIpc();
  registerGithubIpc();
  registerDatabaseIpc();
  registerGitIpc();

  // Existing modules
  registerPtyIpc();
  registerWorktreeIpc();
  registerFsIpc();
  setupCodexIpc();
  registerAgentIpc();
  registerLinearIpc();

  // console.log('✅ All IPC handlers registered');
}
