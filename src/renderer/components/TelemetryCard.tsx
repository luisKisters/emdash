import React from 'react';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { ExternalLink } from 'lucide-react';

const TelemetryCard: React.FC = () => {
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [envDisabled, setEnvDisabled] = React.useState<boolean>(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await window.electronAPI.getTelemetryStatus();
      if (res.success && res.status) {
        setEnabled(Boolean(res.status.enabled));
        setEnvDisabled(Boolean(res.status.envDisabled));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggle = async (checked: boolean) => {
    setEnabled(checked);
    await window.electronAPI.setTelemetryEnabled(checked);
    await refresh();
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">Anonymous Telemetry</div>
          <div className="text-xs text-muted-foreground">
            Help improve Emdash by sending anonymous usage data.
            <span className="ml-1">See docs/telemetry.md for details.</span>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={loading || envDisabled}
          aria-label="Enable anonymous telemetry"
        />
      </div>
      {envDisabled ? (
        <div className="text-xs text-muted-foreground">
          Telemetry disabled by environment variable (TELEMETRY_ENABLED=false).
        </div>
      ) : null}
      <div className="text-xs text-muted-foreground">
        You can also disable telemetry via environment variable:{' '}
        <code>TELEMETRY_ENABLED=false</code>.
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => window.electronAPI.openExternal('https://posthog.com/product')}
        >
          <span>About PostHog</span>
          <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            window.electronAPI.openExternal(
              'https://github.com/generalaction/emdash/blob/main/docs/telemetry.md'
            )
          }
        >
          <span>Telemetry details</span>
          <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};

export default TelemetryCard;
