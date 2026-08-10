import type { TranscriptTurn } from '@emdash/chat-ui';
import { describe, expect, it } from 'vitest';
import type { LoopWithPhases } from '@shared/core/loops/loops';
import {
  detectLoopConversationOutcome,
  findLoopConversationContext,
} from './loop-conversation-banner';

function assistantTurn(text: string): TranscriptTurn {
  return {
    id: 'turn-1',
    seq: 1,
    initiator: 'user',
    items: [{ kind: 'message', id: 'message-1', seq: 1, role: 'assistant', text }],
  };
}

describe('Loop conversation banner', () => {
  it('recognizes a strict final phase sentinel', () => {
    expect(
      detectLoopConversationOutcome(
        [assistantTurn('Everything is green.\n<<<LOOP:PHASE_DONE>>>')],
        null
      )
    ).toBe('done');
    expect(
      detectLoopConversationOutcome([assistantTurn('<<<LOOP:PHASE_DONE>>>\nMore text')], null)
    ).toBeNull();
  });

  it('links an earlier attempt back to its Loop phase', () => {
    const loop = {
      id: 'loop-1',
      name: 'Feature Loop',
      phases: [
        {
          id: 'phase-1',
          name: 'Implement',
          conversationId: 'current-conversation',
        },
      ],
      state: {
        version: '2',
        sessionAttempts: [
          {
            conversationId: 'earlier-conversation',
            purpose: 'work',
            phaseId: 'phase-1',
          },
        ],
      },
    } as LoopWithPhases;

    expect(findLoopConversationContext([loop], 'earlier-conversation')).toEqual({
      loopId: 'loop-1',
      loopName: 'Feature Loop',
      phaseName: 'Implement',
      isCurrentAttempt: false,
    });
  });
});
