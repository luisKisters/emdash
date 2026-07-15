import type { Loop } from '@shared/core/loops/loops';
import { defineEvent } from '@shared/lib/ipc/events';

/** Emitted whenever a loop's status/config changes. */
export const loopUpdatedChannel = defineEvent<Loop>('loop:updated');

/** Emitted after each phase transition so the UI can render live progress. */
export const loopProgressChannel = defineEvent<Loop>('loop:progress');
