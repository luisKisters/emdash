import type { VerifierId } from '@shared/core/loops/loops';
import { createGithubVerifier } from './github';
import type { Verifier } from './types';
import { createUnitTestsVerifier } from './unit-tests';

/**
 * Factory map of the available verifiers. `unit-tests` is always present and runs
 * first; `github` and `browser` are registered by their respective tasks.
 */
const VERIFIER_FACTORIES: Partial<Record<VerifierId, () => Verifier>> = {
  'unit-tests': () => createUnitTestsVerifier(),
  github: () => createGithubVerifier(),
};

export function getVerifier(id: VerifierId): Verifier | undefined {
  return VERIFIER_FACTORIES[id]?.();
}
