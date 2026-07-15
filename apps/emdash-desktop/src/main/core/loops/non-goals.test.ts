import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the loop feature against re-growing the abandoned "loops v2" ceremony.
 * Fails if any forbidden path fragment (clean-room, evidence stores, ledgers,
 * attestation, browser leases, review/e2e gates) appears anywhere under `src/`.
 */
const FORBIDDEN = [
  'clean-room',
  'evidence',
  'attestation',
  'review-gate',
  'loop-ledger',
  'browser-lease',
  'e2e-gate',
];

// This file lives at src/main/core/loops/non-goals.test.ts → walk up to src/.
const srcDir = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function walk(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), relPath));
    else out.push(relPath);
  }
  return out;
}

describe('loop non-goals guard', () => {
  it('has no forbidden ceremony path fragments under src/', () => {
    const offenders = walk(srcDir).filter((f) => FORBIDDEN.some((frag) => f.includes(frag)));
    expect(offenders).toEqual([]);
  });
});
