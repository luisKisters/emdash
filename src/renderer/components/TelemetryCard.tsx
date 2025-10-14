import React from 'react';
import { Switch } from './ui/switch';
import { Button } from './ui/button';

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
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Help improve Emdash by sending anonymous usage data.</p>
          <p>
            <span>See </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="group inline-flex h-auto items-center gap-1 px-0 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline focus-visible:outline-none focus-visible:ring-0"
              onClick={() =>
                window.electronAPI.openExternal(
                  'https://github.com/generalaction/emdash/blob/main/docs/telemetry.md'
                )
              }
            >
              <span className="transition-colors group-hover:text-foreground">
                docs/telemetry.md
              </span>
              <span className="text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                ↗
              </span>
            </Button>
            <span> for details.</span>
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={loading || envDisabled}
          aria-label="Enable anonymous telemetry"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="group gap-2"
          onClick={() => window.electronAPI.openExternal('https://posthog.com/product')}
        >
          <span className="transition-colors group-hover:text-foreground">About PostHog</span>
          <span
            aria-hidden="true"
            className="text-xs text-muted-foreground transition-colors group-hover:text-foreground"
          >
            ↗
          </span>
        </Button>
      </div>
    </div>
  );
};

export default TelemetryCard;
