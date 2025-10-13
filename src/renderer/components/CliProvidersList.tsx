import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Spinner } from './ui/spinner';
import IntegrationRow from './IntegrationRow';
import { CliProviderStatus } from '../types/connections';
import codexLogo from '../../assets/images/openai.png';
import claudeLogo from '../../assets/images/claude.png';
import droidLogo from '../../assets/images/factorydroid.png';
import geminiLogo from '../../assets/images/gemini.png';
import cursorLogo from '../../assets/images/cursorlogo.png';
import copilotLogo from '../../assets/images/ghcopilot.png';
import ampLogo from '../../assets/images/ampcode.png';
import opencodeLogo from '../../assets/images/opencode.png';
import charmLogo from '../../assets/images/charm.png';

interface CliProvidersListProps {
  providers: CliProviderStatus[];
  isLoading: boolean;
  error?: string | null;
}

const PROVIDER_LOGOS: Record<string, string> = {
  codex: codexLogo,
  claude: claudeLogo,
  droid: droidLogo,
  gemini: geminiLogo,
  cursor: cursorLogo,
  copilot: copilotLogo,
  amp: ampLogo,
  opencode: opencodeLogo,
  charm: charmLogo,
};

const renderProviderRow = (provider: CliProviderStatus) => {
  const logo = PROVIDER_LOGOS[provider.id];

  const handleNameClick =
    provider.docUrl && window?.electronAPI?.openExternal
      ? async () => {
          try {
            await window.electronAPI.openExternal(provider.docUrl!);
          } catch (openError) {
            console.error(`Failed to open ${provider.name} docs:`, openError);
          }
        }
      : undefined;

  const isDetected = provider.status === 'connected';
  const indicatorClass = isDetected ? 'bg-emerald-500' : 'bg-muted-foreground/50';
  const statusLabel = isDetected ? 'Detected' : 'Not detected';

  return (
    <IntegrationRow
      key={provider.id}
      logoSrc={logo}
      icon={
        logo ? undefined : <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      }
      name={provider.name}
      onNameClick={handleNameClick}
      status={provider.status}
      statusLabel={statusLabel}
      showStatusPill={false}
      middle={
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${indicatorClass}`} />
          {statusLabel}
        </span>
      }
    />
  );
};

const CliProvidersList: React.FC<CliProvidersListProps> = ({ providers, isLoading, error }) => {
  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      if (a.status === 'connected' && b.status !== 'connected') return -1;
      if (b.status === 'connected' && a.status !== 'connected') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [providers]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-red-200/70 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:border-red-500/40 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/40 py-6">
          <Spinner />
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No CLI providers detected yet. Run “Detect CLIs” once you have them installed locally.
        </div>
      ) : (
        <div className="space-y-2">{sortedProviders.map((provider) => renderProviderRow(provider))}</div>
      )}
    </div>
  );
};

export default CliProvidersList;
