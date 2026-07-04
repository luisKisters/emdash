import type { Client, InitializeResponse, SessionUpdate } from '@agentclientprotocol/sdk';
import type { Result, SerializedError } from '@emdash/shared';
import { ok, toSerializedError } from '@emdash/shared';
import type { AcpAgentApi, IAcpBehavior } from '../agents/plugins/capabilities/acp';
import { type Logger, noopLogger } from '../lib';
import type { AgentUpdate } from './agent-update';
import { toAgentUpdate } from './agent-update';
import type { InitializeFailedError, SpawnFailedError } from './errors';
import { acpErr } from './errors';
import type { AcpProcessHandle, AcpProcessHost } from './transport';

/** Live connection to one spawned agent process. */
export interface AcpAgentConnection {
  handle: AcpProcessHandle;
  agent: AcpAgentApi;
  normalize: (raw: SessionUpdate) => AgentUpdate;
  /** Resolves with agent capabilities once initialize completes, or an error if it fails. */
  initialized: Promise<Result<{ supportsLoadSession: boolean }, InitializeFailedError>>;
  /** Resolves when the underlying agent process exits or emits an error. */
  closed: Promise<AcpAgentCloseEvent>;
}

export interface AcpAgentCloseEvent {
  exitCode: number | null;
  error?: SerializedError;
  stderrTail?: string;
}

const STDERR_TAIL_LIMIT = 32 * 1024;

function appendStderrTail(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= STDERR_TAIL_LIMIT) return next;
  return next.slice(next.length - STDERR_TAIL_LIMIT);
}

/**
 * Spin up an agent process and return a live connection to it.
 * Returns an Err if the spawn or connection phase fails; initialize failures
 * are reported through `AcpAgentConnection.initialized` so the process can be
 * registered before the handshake completes.
 */
export async function createAcpAgentConnection(
  deps: {
    host: AcpProcessHost;
    behavior: IAcpBehavior;
    logger?: Logger;
  },
  args: {
    providerId: string;
    cwd: string;
    /** Factory called once; the runtime passes its buildClientHandler result here. */
    buildClient: (agent: AcpAgentApi) => Client;
    /** Called when the process exits unexpectedly or initialize fails. */
    onClosed: (event: AcpAgentCloseEvent) => void;
  }
): Promise<Result<AcpAgentConnection, SpawnFailedError>> {
  const { providerId, cwd, buildClient, onClosed } = args;
  const { host, behavior, logger = noopLogger } = deps;

  let handle: AcpProcessHandle;
  try {
    const { cli, agentEnv } = await host.resolveSpawnContext(providerId);
    const {
      command,
      args: spawnArgs,
      env: envOverlay,
    } = behavior.buildSpawn({ cwd, env: agentEnv, cli });

    handle = await host.spawn({
      command,
      args: spawnArgs,
      env: { ...agentEnv, ...envOverlay },
      cwd,
    });
  } catch (e) {
    return acpErr.spawnFailed(toSerializedError(e));
  }

  let stderrTail = '';
  if (handle.stderr) {
    handle.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrTail = appendStderrTail(stderrTail, text);
      logger.debug('createAcpAgentConnection: agent stderr', { text: text.trim() });
    });
  }

  let resolveClosed!: (event: AcpAgentCloseEvent) => void;
  const closed = new Promise<AcpAgentCloseEvent>((resolve) => {
    resolveClosed = resolve;
  });
  let didClose = false;
  const closeOnce = (event: Omit<AcpAgentCloseEvent, 'stderrTail'>): void => {
    if (didClose) return;
    didClose = true;
    const closedEvent: AcpAgentCloseEvent = {
      ...event,
      ...(stderrTail.trim() ? { stderrTail: stderrTail.trim() } : {}),
    };

    const logPayload = {
      providerId,
      cwd,
      exitCode: closedEvent.exitCode,
      error: closedEvent.error?.message,
      stderrTail: closedEvent.stderrTail,
    };
    if (closedEvent.error || closedEvent.exitCode !== 0 || closedEvent.stderrTail) {
      logger.warn('createAcpAgentConnection: agent process closed', logPayload);
    } else {
      logger.debug('createAcpAgentConnection: agent process closed', logPayload);
    }

    onClosed(closedEvent);
    resolveClosed(closedEvent);
  };

  handle.onExit((exitCode) => closeOnce({ exitCode }));
  handle.onError((err) => {
    logger.error('createAcpAgentConnection: agent process error', { error: err.message });
    closeOnce({ exitCode: handle.exitCode, error: toSerializedError(err) });
  });

  const connection = behavior.connect({ stdin: handle.stdin, stdout: handle.stdout }, buildClient);

  const normalize = (raw: SessionUpdate): AgentUpdate => {
    const base = toAgentUpdate(raw);
    return behavior.enrich ? behavior.enrich(base, raw) : base;
  };

  const supportsTerminal = typeof host.spawnTerminal === 'function';
  const initialized: AcpAgentConnection['initialized'] = connection
    .initialize({
      protocolVersion: 1,
      clientInfo: { name: 'emdash', version: '1' },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: supportsTerminal,
      },
    })
    .then((resp: InitializeResponse) => {
      const supportsLoadSession = resp.agentCapabilities?.loadSession === true;
      logger.debug('createAcpAgentConnection: initialized', { supportsLoadSession });
      return ok({ supportsLoadSession });
    })
    .catch((e: unknown) => {
      logger.error('createAcpAgentConnection: initialize failed', {
        error: e instanceof Error ? e.message : String(e),
        stderrTail: stderrTail.trim() || undefined,
      });
      closeOnce({ exitCode: handle.exitCode, error: toSerializedError(e) });
      return acpErr.initializeFailed(toSerializedError(e));
    });

  return ok({ handle, agent: connection, normalize, initialized, closed });
}
