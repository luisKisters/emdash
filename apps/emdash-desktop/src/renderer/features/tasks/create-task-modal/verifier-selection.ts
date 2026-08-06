import type { LoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import type { DetectedVerifier, SelectedVerifier } from '@shared/core/loops/verifier-catalog';

export function selectDetectedVerifier(verifier: DetectedVerifier): SelectedVerifier {
  return {
    kind: 'detected',
    id: verifier.id,
    class: verifier.class,
    label: verifier.label,
    command: verifier.command,
  };
}

export function applyVerifierPlan(
  draft: LoopPlanDraft,
  verifierPlan: SelectedVerifier[]
): LoopPlanDraft {
  const browserEnabled = verifierPlan.some(
    (verifier) => verifier.kind === 'detected' && verifier.class === 'browser'
  );
  return {
    ...draft,
    verifierPlan,
    validationCommands: verifierPlan.flatMap((verifier) =>
      verifier.kind === 'detected' && verifier.class !== 'browser' && verifier.command.trim()
        ? [verifier.command]
        : []
    ),
    terminalGates: { ...draft.terminalGates, e2e: browserEnabled },
  };
}
