import type { IExecutionContext } from '@main/core/execution-context/types';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunCommandOptions {
  /** Working directory (defaults to the execution context root when omitted). */
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Single-quote a value for safe inclusion in a shell command. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Runs a shell command through an execution context (local or SSH) and buffers
 * its output. Unlike `IExecutionContext.exec`, a non-zero exit is NOT thrown —
 * it is reported via `exitCode`. AbortErrors are rethrown so callers can react
 * to cancellation.
 */
export async function runCommand(
  ctx: IExecutionContext,
  command: string,
  opts: RunCommandOptions = {}
): Promise<CommandResult> {
  const body = opts.cwd ? `cd ${shellQuote(opts.cwd)} && ${command}` : command;
  try {
    const { stdout, stderr } = await ctx.exec('sh', ['-c', body], {
      timeout: opts.timeoutMs,
      signal: opts.signal,
    });
    return { exitCode: 0, stdout, stderr, timedOut: false };
  } catch (error) {
    if (isAbortError(error)) throw error;
    const err = error as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
    };
    const timedOut = err.killed === true || err.signal === 'SIGTERM';
    const exitCode = typeof err.code === 'number' ? err.code : 1;
    return {
      exitCode: timedOut ? exitCode || 124 : exitCode,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? (error instanceof Error ? error.message : String(error)),
      timedOut,
    };
  }
}
