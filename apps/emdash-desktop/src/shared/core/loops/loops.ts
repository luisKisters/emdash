import type { LoopConfig } from './loop-config';

export type LoopStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';

export type PhaseStatus = 'pending' | 'running' | 'verifying' | 'passed' | 'failed';

export type VerifierId = 'unit-tests' | 'github' | 'browser';

export type LoopPhase = {
  id: string;
  name: string;
  goal: string;
  checks: VerifierId[];
  status: PhaseStatus;
  attempts: number;
};

export type Loop = {
  id: string;
  taskId: string;
  status: LoopStatus;
  currentPhaseIndex: number;
  phases: LoopPhase[];
  config: LoopConfig;
};

const LOOP_STATUSES: readonly LoopStatus[] = ['draft', 'running', 'paused', 'completed', 'failed'];

const TERMINAL_LOOP_STATUSES: readonly LoopStatus[] = ['completed', 'failed'];

export function isLoopStatus(value: unknown): value is LoopStatus {
  return typeof value === 'string' && LOOP_STATUSES.includes(value as LoopStatus);
}

export function isTerminalLoopStatus(value: unknown): value is 'completed' | 'failed' {
  return typeof value === 'string' && TERMINAL_LOOP_STATUSES.includes(value as LoopStatus);
}
