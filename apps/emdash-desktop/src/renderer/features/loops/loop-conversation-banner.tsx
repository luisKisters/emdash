import type { ChatState, TranscriptTurn } from '@emdash/chat-ui';
import { CheckCircle2, CircleAlert, Repeat2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import type { LoopWithPhases } from '@shared/core/loops/loops';

export type LoopConversationContext = {
  loopId: string;
  loopName: string;
  phaseName: string;
  isCurrentAttempt: boolean;
};

export type LoopConversationOutcome = 'done' | 'failed';

export function findLoopConversationContext(
  loops: readonly LoopWithPhases[],
  conversationId: string
): LoopConversationContext | null {
  for (const loop of loops) {
    const directPhase = loop.phases.find((phase) => phase.conversationId === conversationId);
    if (directPhase) {
      return {
        loopId: loop.id,
        loopName: loop.name,
        phaseName: directPhase.name,
        isCurrentAttempt: true,
      };
    }

    const attempt =
      loop.state?.version === '2'
        ? loop.state.sessionAttempts.find(
            (candidate) =>
              candidate.conversationId === conversationId && candidate.purpose === 'work'
          )
        : undefined;
    const attemptedPhase = attempt?.phaseId
      ? loop.phases.find((phase) => phase.id === attempt.phaseId)
      : undefined;
    if (attemptedPhase) {
      return {
        loopId: loop.id,
        loopName: loop.name,
        phaseName: attemptedPhase.name,
        isCurrentAttempt: attemptedPhase.conversationId === conversationId,
      };
    }
  }
  return null;
}

export function detectLoopConversationOutcome(
  committedTurns: readonly TranscriptTurn[],
  activeTurn: TranscriptTurn | null
): LoopConversationOutcome | null {
  const turns = activeTurn ? [...committedTurns, activeTurn] : committedTurns;
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const items = turns[turnIndex]?.items ?? [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = items[itemIndex];
      if (item?.kind !== 'message' || item.role !== 'assistant') continue;
      const finalLine = item.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);
      if (finalLine === '<<<LOOP:PHASE_DONE>>>') return 'done';
      if (/^<<<LOOP:PHASE_FAILED[ \t]+[^\r\n<>]+>>>$/.test(finalLine ?? '')) return 'failed';
      return null;
    }
  }
  return null;
}

export function LoopConversationBanner({
  projectId,
  conversationId,
  chatState,
  transcriptRevision,
  onOpenLoop,
}: {
  projectId: string;
  conversationId: string;
  chatState: ChatState;
  transcriptRevision: number;
  onOpenLoop: (loopId: string) => void;
}) {
  const [context, setContext] = useState<LoopConversationContext | null>(null);

  useEffect(() => {
    let active = true;
    setContext(null);
    void rpc.loops.getLoopsForProject(projectId).then((result) => {
      if (!active || !result.success) return;
      setContext(findLoopConversationContext(result.data, conversationId));
    });
    return () => {
      active = false;
    };
  }, [conversationId, projectId]);

  void transcriptRevision;
  const transcript = chatState.transcript.state;
  const outcome = detectLoopConversationOutcome(
    transcript.committedTurns,
    transcript.activeTurnSnapshot
  );
  if (!context || !outcome) return null;

  const completed = outcome === 'done';
  const title = completed ? 'Loop phase result ready' : 'Loop phase reported a blocker';
  const description = context.isCurrentAttempt
    ? context.phaseName
    : `${context.phaseName} · earlier attempt`;

  return (
    <div className="pointer-events-auto absolute top-3 left-1/2 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-background-1 p-3 shadow-lg">
      {completed ? (
        <CheckCircle2 className="size-4 shrink-0 text-foreground-success" />
      ) : (
        <CircleAlert className="size-4 shrink-0 text-foreground-warning" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{title}</div>
        <div className="truncate text-xs text-foreground-muted">{description}</div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label={`Open ${context.loopName}`}
        onClick={() => onOpenLoop(context.loopId)}
      >
        <Repeat2 className="size-3.5" />
        Open Loop
      </Button>
    </div>
  );
}
