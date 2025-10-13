import React, { useCallback } from 'react';
import { RefreshCcw, Sparkles, Bot, Pointer, Stars, Infinity, Box, GitBranch, Code } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Spinner } from './ui/spinner';
import { CliProviderStatus } from '../types/connections';
import { cn } from '../lib/utils';

interface CliProvidersListProps {
  providers: CliProviderStatus[];
  isLoading: boolean;
  error?: string | null;
  onRefresh: () => void;
}

type ActionVariant = 'default' | 'outline';

const STATUS_LABELS: Record<CliProviderStatus['status'], string> = {
  connected: 'Connected',
  missing: 'Missing',
  needs_key: 'Needs API key',
  error: 'Error',
};

const STATUS_CLASSES: Record<CliProviderStatus['status'], string> = {
  connected:
    'bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400',
  missing:
    'bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/20 dark:text-rose-400',
  needs_key:
    'bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 ring-1 ring-inset ring-red-500/20 dark:text-red-400',
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  codex: Sparkles,
  claude: Bot,
  cursor: Pointer,
  gemini: Stars,
  openai: Infinity,
  node: Box,
  git: GitBranch,
  python: Code,
};

function resolveAction(provider: CliProviderStatus): {
  label: string;
  variant: ActionVariant;
  onClick?: () => void;
} | null {
  if (!provider.docUrl) {
    return null;
  }

  const openDocs = async () => {
    try {
      await window.electronAPI.openExternal(provider.docUrl!);
    } catch (error) {
      console.error('Failed to open documentation link:', error);
    }
  };

  switch (provider.status) {
    case 'connected':
      return { label: 'Docs', variant: 'outline', onClick: openDocs };
    case 'missing':
      return { label: 'Install', variant: 'default', onClick: openDocs };
    case 'needs_key':
      return { label: 'Add key', variant: 'default', onClick: openDocs };
    case 'error':
      return { label: 'Troubleshoot', variant: 'outline', onClick: openDocs };
    default:
      return null;
  }
}

const CliProvidersList: React.FC<CliProvidersListProps> = ({ providers, isLoading, error, onRefresh }) => {
  const handleRefresh = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We auto-detect installed CLIs so agents can chain tasks across local tooling.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" className="mr-2" /> Detecting…
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" /> Detect CLIs
            </>
          )}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <Spinner />
        </div>
      ) : providers.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-gray-200 bg-white p-4 text-sm text-muted-foreground dark:border-gray-700 dark:bg-gray-900">
          <p>No CLI providers detected yet. Run “Detect CLIs” once you have them installed locally.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const Icon = ICONS[provider.id] ?? Sparkles;
            const action = resolveAction(provider);
            const detail = provider.version
              ? `Detected v${provider.version}`
              : provider.message || 'Not detected yet.';

            return (
              <div
                key={provider.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{provider.name}</span>
                      <Badge className={cn('px-2 py-0 text-[11px] font-medium', STATUS_CLASSES[provider.status])}>
                        {STATUS_LABELS[provider.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                    {provider.command ? (
                      <p className="text-xs text-muted-foreground/80">Command: {provider.command}</p>
                    ) : null}
                  </div>
                </div>
                {action ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={action.variant}
                    onClick={action.onClick}
                    className="self-start md:self-center"
                  >
                    {action.label}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        We never upload your code. Only metadata needed for each integration is shared.
      </p>
    </div>
  );
};

export default CliProvidersList;
