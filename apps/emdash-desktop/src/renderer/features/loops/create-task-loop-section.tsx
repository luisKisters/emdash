import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { Field, FieldDescription, FieldLabel } from '@renderer/lib/ui/field';
import { Switch } from '@renderer/lib/ui/switch';

export type CreateTaskLoopSectionProps = {
  onEnable: () => void;
};

export function CreateTaskLoopSection({ onEnable }: CreateTaskLoopSectionProps) {
  const { value: experiments, isLoading } = useAppSettingsKey('experiments');

  if (isLoading || !experiments?.loops) return null;

  return (
    <section
      role="region"
      aria-label="Loop setup"
      className="flex w-full flex-col gap-4 rounded-lg border border-border bg-background-1 p-4"
    >
      <Field orientation="horizontal">
        <Switch
          checked={false}
          aria-label="Create this task with a Loop"
          onCheckedChange={(enabled) => {
            if (enabled) onEnable();
          }}
        />
        <div className="flex flex-col gap-0.5">
          <FieldLabel>Create with Loop</FieldLabel>
          <FieldDescription>
            Select or paste a plan, then choose repository verification on the next screen.
          </FieldDescription>
        </div>
      </Field>
    </section>
  );
}
