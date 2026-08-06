import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { ComboboxTrigger, ComboboxValue } from '@renderer/lib/ui/combobox';
import { ComboboxPopover } from '@renderer/lib/ui/combobox-popover';
import { FieldError } from '@renderer/lib/ui/field';
import { Textarea } from '@renderer/lib/ui/textarea';

type PlanOption = { value: string; label: string };

export function PlanComboboxField({
  projectId,
  workspaceId,
  selectedPath,
  planSource,
  onSelect,
}: {
  projectId?: string;
  workspaceId?: string | null;
  selectedPath: string | null;
  planSource: string;
  onSelect: (path: string | null, source: string) => void;
}) {
  const [pasteMode, setPasteMode] = useState(selectedPath === null && planSource.length > 0);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['create-task', 'plan-files', projectId, workspaceId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) return [];
      if (workspaceId) {
        return rpc.search.searchWorkspaceFiles({ workspaceId, query: '', limit: 200 });
      }
      const result = await rpc.loops.listProjectPlanFiles(projectId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    select: (files): PlanOption[] =>
      files
        .filter((file) => /\.md$/i.test(file.path))
        .map((file) => ({ value: file.path, label: file.path })),
    staleTime: 30_000,
  });
  const selected = query.data?.find((item) => item.value === selectedPath) ?? null;

  const selectFile = async (item: PlanOption): Promise<void> => {
    if (!projectId) return;
    setError(null);
    let content: string;
    if (workspaceId) {
      const result = await rpc.workspace.files.readFile(
        projectId,
        workspaceId,
        item.value,
        1_000_000
      );
      if (!result.success) {
        setError('Could not read this plan file.');
        return;
      }
      content = result.data.content;
    } else {
      const result = await rpc.loops.readProjectPlanFile(projectId, item.value, 1_000_000);
      if (!result.success) {
        setError('Could not read this plan file.');
        return;
      }
      content = result.data;
    }
    setPasteMode(false);
    onSelect(item.value, content);
  };

  if (pasteMode) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Textarea
          aria-label="Pasted plan"
          autoFocus
          value={planSource}
          placeholder="Paste the Markdown plan"
          onInput={(event) => onSelect(null, event.currentTarget.value)}
        />
        <Button type="button" size="sm" variant="ghost" onClick={() => setPasteMode(false)}>
          Select a file instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <ComboboxPopover
        items={query.data ?? []}
        value={selected}
        onValueChange={(item) => void selectFile(item)}
        placeholder="Search Markdown files..."
        actions={[{ id: 'paste', label: 'Paste instead', onClick: () => setPasteMode(true) }]}
        trigger={
          <ComboboxTrigger className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border px-2.5 text-left text-sm outline-none hover:bg-background-2">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0 text-foreground-passive" />
              <ComboboxValue
                placeholder={query.isPending ? 'Loading plans…' : 'Select a plan file'}
              />
            </span>
          </ComboboxTrigger>
        }
      />
      {query.isError ? <FieldError>Could not list plan files.</FieldError> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
