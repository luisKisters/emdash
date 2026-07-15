import type { LoopPhase } from '@shared/core/loops/loops';

/**
 * Repo/PR facts handed to the phase agent so it has GitHub context in its prompt.
 * All fields are optional — `loop-github-context.ts` degrades gracefully when no
 * account/PR is connected.
 */
export interface GithubFacts {
  nameWithOwner?: string | null;
  host?: string | null;
  branch?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
}

export const PHASE_DONE_SENTINEL = '<<<LOOP:PHASE_DONE>>>';
export const PHASE_FAILED_SENTINEL = '<<<LOOP:PHASE_FAILED>>>';

export type PhaseOutcome = 'done' | 'failed' | 'unknown';

/** Renders repo/PR facts as a plain-text block, or `''` when nothing is known. */
export function renderGithubFacts(github?: GithubFacts): string {
  if (!github) return '';
  const lines: string[] = [];
  if (github.nameWithOwner) lines.push(`- Repository: ${github.nameWithOwner}`);
  if (github.host) lines.push(`- Host: ${github.host}`);
  if (github.branch) lines.push(`- Branch: ${github.branch}`);
  if (github.prNumber != null) lines.push(`- Pull request: #${github.prNumber}`);
  if (github.prUrl) lines.push(`- Pull request URL: ${github.prUrl}`);
  if (lines.length === 0) return '';
  return `\nGitHub context:\n${lines.join('\n')}\n`;
}

function sentinelInstructions(): string {
  return (
    `When you have finished, emit exactly one sentinel on its own line: ` +
    `${PHASE_DONE_SENTINEL} if the goal is complete, or ${PHASE_FAILED_SENTINEL} if you ` +
    `could not complete it. Work only the current phase goal; do not start other work.`
  );
}

export function buildPhasePrompt(
  phase: LoopPhase,
  context: { priorSummary?: string; github?: GithubFacts } = {}
): string {
  const parts: string[] = [];
  parts.push(`Phase: ${phase.name}`);
  parts.push(`Goal:\n${phase.goal}`);
  if (context.priorSummary) {
    parts.push(`Result of the previous phase:\n${context.priorSummary}`);
  }
  const gh = renderGithubFacts(context.github);
  if (gh) parts.push(gh.trim());
  parts.push(sentinelInstructions());
  return parts.join('\n\n');
}

export function buildRetryPrompt(phase: LoopPhase, lastFailure: string): string {
  const parts: string[] = [];
  parts.push(`Phase: ${phase.name}`);
  parts.push(`Goal:\n${phase.goal}`);
  parts.push(`The previous attempt did not pass. Failure details:\n${lastFailure}`);
  parts.push(`Fix the problem and try again. ${sentinelInstructions()}`);
  return parts.join('\n\n');
}

export function parsePhaseOutcome(text: string): PhaseOutcome {
  const hasDone = text.includes(PHASE_DONE_SENTINEL);
  const hasFailed = text.includes(PHASE_FAILED_SENTINEL);
  if (hasFailed) return 'failed';
  if (hasDone) return 'done';
  return 'unknown';
}
