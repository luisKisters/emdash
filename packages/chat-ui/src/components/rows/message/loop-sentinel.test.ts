import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/model';
import { displayMessageText } from './loop-sentinel';

function message(text: string, role: ChatMessage['role'] = 'assistant'): ChatMessage {
  return { kind: 'message', id: 'message-1', role, text };
}

describe('displayMessageText', () => {
  it('removes a final Loop phase-done sentinel from assistant text', () => {
    expect(displayMessageText(message('Work completed.\n\n<<<LOOP:PHASE_DONE>>>'))).toBe(
      'Work completed.'
    );
  });

  it('removes a final Loop phase-failed sentinel from assistant text', () => {
    expect(
      displayMessageText(message('Could not continue.\n<<<LOOP:PHASE_FAILED missing access>>>'))
    ).toBe('Could not continue.');
  });

  it('keeps malformed or non-final markers visible', () => {
    expect(displayMessageText(message('<<<LOOP:PHASE_DONE>>>\nMore text'))).toBe(
      '<<<LOOP:PHASE_DONE>>>\nMore text'
    );
    expect(displayMessageText(message('<<LOOP:PHASE_DONE>>'))).toBe('<<LOOP:PHASE_DONE>>');
  });

  it('does not hide markers written by the user', () => {
    expect(displayMessageText(message('<<<LOOP:PHASE_DONE>>>', 'user'))).toBe(
      '<<<LOOP:PHASE_DONE>>>'
    );
  });
});
