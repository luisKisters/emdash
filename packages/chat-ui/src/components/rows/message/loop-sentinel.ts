import type { ChatMessage } from '@/model';

const FINAL_LOOP_SENTINEL =
  /(?:^|\r?\n)[\t ]*<<<LOOP:PHASE_(?:DONE|FAILED[\t ]+[^\r\n<>]+)>>>[\t ]*$/;

export function displayMessageText(message: ChatMessage): string {
  if (message.role !== 'assistant') return message.text;
  return message.text.replace(FINAL_LOOP_SENTINEL, '').trimEnd();
}
