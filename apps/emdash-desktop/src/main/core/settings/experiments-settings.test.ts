import { describe, expect, it } from 'vitest';
import { experimentsSettingsSchema, taskSettingsSchema } from './schema';
import { getDefaultForKey } from './settings-registry';

describe('experiments settings', () => {
  it('defaults experiments.loops to false', () => {
    expect(getDefaultForKey('experiments').loops).toBe(false);
    expect(experimentsSettingsSchema.parse({}).loops).toBe(false);
  });

  it('round-trips experiments.loops', () => {
    expect(experimentsSettingsSchema.parse({ loops: true })).toEqual({ loops: true });
    expect(experimentsSettingsSchema.parse({ loops: false })).toEqual({ loops: false });
  });

  it('defaults tasks.maxLoopAttempts to 3', () => {
    expect(getDefaultForKey('tasks').maxLoopAttempts).toBe(3);
    expect(taskSettingsSchema.parse(getDefaultForKey('tasks')).maxLoopAttempts).toBe(3);
  });
});
