import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LoopPlanDraft } from '@renderer/features/loops/loop-plan-model';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@renderer/lib/ui/field';
import { Input } from '@renderer/lib/ui/input';
import type { DetectedVerifier, SelectedVerifier } from '@shared/core/loops/verifier-catalog';
import { applyVerifierPlan, selectDetectedVerifier } from './verifier-selection';

export function VerifierPicker({
  projectId,
  value,
  initialized,
  onChange,
}: {
  projectId: string;
  value: LoopPlanDraft;
  initialized: boolean;
  onChange: (value: LoopPlanDraft, initialized: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState('');
  const query = useQuery({
    queryKey: ['loops', 'detect-verifiers', projectId, 'codex'],
    queryFn: async () => {
      const result = await rpc.loops.detectVerifiers({ projectId, provider: 'codex' });
      if (!result.success) throw new Error(result.error.message);
      const { verifiers, availability } = result.data;
      return { verifiers, availability };
    },
  });

  useEffect(() => {
    if (!query.data || initialized) return;
    onChange(applyVerifierPlan(value, query.data.verifiers.map(selectDetectedVerifier)), true);
  }, [initialized, onChange, query.data, value]);

  const groups = useMemo(() => {
    const result = new Map<string, DetectedVerifier[]>();
    for (const verifier of query.data?.verifiers ?? []) {
      const entries = result.get(verifier.class) ?? [];
      entries.push(verifier);
      result.set(verifier.class, entries);
    }
    return [...result.entries()];
  }, [query.data]);

  const toggle = (verifier: DetectedVerifier, checked: boolean): void => {
    const next = checked
      ? [...value.verifierPlan, selectDetectedVerifier(verifier)]
      : value.verifierPlan.filter(
          (selected) => !(selected.kind === 'detected' && selected.id === verifier.id)
        );
    onChange(applyVerifierPlan(value, next), true);
  };

  const addCustom = (): void => {
    const name = customName.trim();
    if (!name) return;
    const custom: SelectedVerifier = { kind: 'custom', name, command: null };
    onChange(applyVerifierPlan(value, [...value.verifierPlan, custom]), true);
    setCustomName('');
    setAdding(false);
  };

  if (query.isPending) {
    return (
      <div role="status" className="text-sm text-foreground-muted">
        Detecting verifiers…
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {query.isError ? (
        <div className="flex items-center gap-3">
          <FieldError>{query.error.message || 'Could not detect verifiers.'}</FieldError>
          <Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-foreground-muted">No verifiers were detected.</p>
      ) : (
        groups.map(([verifierClass, verifiers]) => (
          <section key={verifierClass} className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-wide text-foreground-passive uppercase">
              {verifierClass.replace('-', ' ')}
            </h2>
            {verifiers.map((verifier) => {
              const availability = query.data.availability.find(
                (entry) => entry.id === verifier.id
              );
              const checked = value.verifierPlan.some(
                (selected) => selected.kind === 'detected' && selected.id === verifier.id
              );
              return (
                <Field
                  key={verifier.id}
                  orientation="horizontal"
                  className="rounded-md border border-border bg-background-1 p-3"
                >
                  <Checkbox
                    aria-label={verifier.label}
                    checked={checked}
                    onCheckedChange={(next) => toggle(verifier, next)}
                  />
                  <div className="min-w-0 flex-1">
                    <FieldLabel>{verifier.label}</FieldLabel>
                    {verifier.class !== 'browser' ? (
                      <FieldDescription className="font-mono text-xs break-all">
                        {verifier.command}
                      </FieldDescription>
                    ) : null}
                    {availability?.reason ? (
                      <FieldDescription>{availability.reason}</FieldDescription>
                    ) : null}
                  </div>
                </Field>
              );
            })}
          </section>
        ))
      )}

      {value.verifierPlan
        .filter(
          (verifier): verifier is Extract<SelectedVerifier, { kind: 'custom' }> =>
            verifier.kind === 'custom'
        )
        .map((verifier, index) => (
          <Field
            key={`${verifier.name}-${index}`}
            orientation="horizontal"
            className="rounded-md border border-border bg-background-1 p-3"
          >
            <Checkbox
              aria-label={verifier.name}
              checked
              onCheckedChange={(checked) => {
                if (checked) return;
                onChange(
                  applyVerifierPlan(
                    value,
                    value.verifierPlan.filter((entry) => entry !== verifier)
                  ),
                  true
                );
              }}
            />
            <FieldLabel>{verifier.name}</FieldLabel>
          </Field>
        ))}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Custom verifier name"
            autoFocus
            value={customName}
            placeholder="Verifier name"
            onInput={(event) => setCustomName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addCustom();
            }}
          />
          <Button type="button" size="sm" disabled={!customName.trim()} onClick={addCustom}>
            Add
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-fit"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" />
          Custom verifier
        </Button>
      )}
    </div>
  );
}
