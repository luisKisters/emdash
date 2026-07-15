import { describe, expect, it } from 'vitest';
import { loopConfig } from './loop-config';
import { isLoopStatus, isTerminalLoopStatus } from './loops';

describe('loop status guards', () => {
  it('recognizes valid loop statuses', () => {
    for (const status of ['draft', 'running', 'paused', 'completed', 'failed']) {
      expect(isLoopStatus(status)).toBe(true);
    }
  });

  it('rejects invalid loop statuses', () => {
    expect(isLoopStatus('verifying')).toBe(false);
    expect(isLoopStatus('')).toBe(false);
    expect(isLoopStatus(null)).toBe(false);
    expect(isLoopStatus(42)).toBe(false);
  });

  it('identifies terminal statuses', () => {
    expect(isTerminalLoopStatus('completed')).toBe(true);
    expect(isTerminalLoopStatus('failed')).toBe(true);
    expect(isTerminalLoopStatus('running')).toBe(false);
    expect(isTerminalLoopStatus('paused')).toBe(false);
  });
});

describe('loop config', () => {
  it('parses a valid v1 config and round-trips through serialize', () => {
    const value = { version: '1' as const, provider: 'claude', model: '' };
    const result = loopConfig.safeParse(value);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.data.provider).toBe('claude');

    const serialized = loopConfig.serialize(result.data);
    const parsed = loopConfig.parseJson(serialized);
    expect(parsed).toEqual(value);
  });

  it('rejects a config missing the version field', () => {
    const result = loopConfig.safeParse({ provider: 'claude', model: '' });
    expect(result.status).not.toBe('ok');
  });
});
