export const VERIFIER_CLASSES = [
  'unit-test',
  'e2e',
  'lint',
  'typecheck',
  'build',
  'format',
  'browser',
  'db',
  'custom',
] as const;

export type VerifierClass = (typeof VERIFIER_CLASSES)[number];

export type DetectedVerifier = {
  id: string;
  class: VerifierClass;
  label: string;
  command: string;
  source: string;
};

export type SelectedVerifier =
  | {
      kind: 'detected';
      id: string;
      class: VerifierClass;
      label: string;
      command: string;
    }
  | { kind: 'custom'; name: string; command: string | null };
