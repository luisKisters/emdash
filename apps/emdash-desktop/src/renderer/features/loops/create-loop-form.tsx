import { observer } from 'mobx-react-lite';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { useCloseGuard } from '@renderer/lib/modal/use-close-guard';
import { useAgents } from '@renderer/lib/stores/use-agents';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import { ConfirmButton } from '@renderer/lib/ui/confirm-button';
import { DialogContentArea, DialogFooter, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';
import { Field, FieldLabel } from '@renderer/lib/ui/field';
import { Input } from '@renderer/lib/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { Textarea } from '@renderer/lib/ui/textarea';
import { CreateLoopFormModel, OPTIONAL_CHECKS } from './create-loop-form-model';

/**
 * Create-loop form: edit an ordered list of phases (name + goal), toggle the
 * optional github/browser checks per phase (unit-tests is fixed on), pick the
 * model, then create + start the loop for the given task.
 */
export const CreateLoopForm = observer(function CreateLoopForm({
  onSuccess,
  taskId,
}: BaseModalProps<{ loopId: string }> & { taskId: string }) {
  const model = useMemo(() => new CreateLoopFormModel(), []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCloseGuard(isSubmitting);

  const { data: agents } = useAgents();
  const modelsCapability = agents?.find((a) => a.id === model.provider)?.capabilities.models;
  const modelOptions =
    modelsCapability?.kind === 'selectable' ? modelsCapability.modelOptions : null;

  const handleSubmit = useCallback(async () => {
    if (!model.canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const loop = await rpc.loops.create(model.toCreateInput(taskId));
      await rpc.loops.start(loop.id);
      setIsSubmitting(false);
      onSuccess({ loopId: loop.id });
    } catch {
      setError('Failed to create loop');
      setIsSubmitting(false);
    }
  }, [isSubmitting, model, onSuccess, taskId]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Loop</DialogTitle>
      </DialogHeader>
      <DialogContentArea>
        <div className="flex flex-col gap-4" data-testid="create-loop-form">
          {model.phases.map((phase, index) => (
            <div key={phase.id} className="flex flex-col gap-2 rounded-md border border-border-1 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Phase {index + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move phase up"
                    disabled={index === 0}
                    onClick={() => model.movePhase(phase.id, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move phase down"
                    disabled={index === model.phases.length - 1}
                    onClick={() => model.movePhase(phase.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Remove phase"
                    disabled={model.phases.length <= 1}
                    onClick={() => model.removePhase(phase.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Phase name"
                value={phase.name}
                onChange={(e) => model.setName(phase.id, e.target.value)}
              />
              <Textarea
                placeholder="Phase goal"
                value={phase.goal}
                onChange={(e) => model.setGoal(phase.id, e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked disabled />
                  unit-tests
                </label>
                {OPTIONAL_CHECKS.map((check) => (
                  <label key={check} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={model.hasCheck(phase.id, check)}
                      onCheckedChange={() => model.toggleCheck(phase.id, check)}
                    />
                    {check}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => model.addPhase()}>
            <Plus /> Add phase
          </Button>
          {modelOptions ? (
            <Field>
              <FieldLabel>Model</FieldLabel>
              <Select
                value={model.model}
                onValueChange={(val) => {
                  model.model = val ?? '';
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default model">
                    {model.model ? (modelOptions[model.model]?.name ?? model.model) : 'Default model'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default model</SelectItem>
                  {Object.entries(modelOptions).map(([id, opt]) => (
                    <SelectItem key={id} value={id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton onClick={() => void handleSubmit()} disabled={!model.canSubmit || isSubmitting}>
          {isSubmitting ? 'Starting...' : 'Create & Start'}
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});
