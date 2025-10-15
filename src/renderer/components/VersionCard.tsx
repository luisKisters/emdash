import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { useUpdater } from '@/hooks/useUpdater';

const VersionCard: React.FC = () => {
  const [electronVersion, setElectronVersion] = useState<string>('...');
  const [emdashVersion, setEmdashVersion] = useState<string>('...');
  const [platform, setPlatform] = useState<string>('');
  const { state: update, check, download, install, openLatest, progressLabel } = useUpdater();

  useEffect(() => {
    let cancelled = false;

    const loadVersionInfo = async () => {
      try {
        const [appVersion, electronVer, appPlatform] = await Promise.all([
          window.electronAPI.getAppVersion(),
          window.electronAPI.getElectronVersion(),
          window.electronAPI.getPlatform(),
        ]);
        if (!cancelled) {
          setEmdashVersion(appVersion);
          setElectronVersion(electronVer);
          setPlatform(appPlatform);
        }
      } catch (error) {
        console.error('Failed to load version info:', error);
        if (!cancelled) {
          setEmdashVersion('Unknown');
          setElectronVersion('Unknown');
        }
      }
    };

    loadVersionInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  // no-op local effects

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">emdash</span>
            <code className="font-mono text-sm text-muted-foreground">{emdashVersion}</code>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">Electron</span>
            <code className="font-mono text-sm text-muted-foreground">{electronVersion}</code>
          </div>
          {platform && <p className="text-xs text-muted-foreground">Platform: {platform}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {update.status === 'idle' || update.status === 'not-available' ? (
          <Button size="sm" variant="outline" onClick={check}>
            Check for updates
          </Button>
        ) : null}

        {update.status === 'checking' ? (
          <Button size="sm" variant="outline" disabled aria-busy>
            <Spinner size="sm" className="mr-2" />
            Checking...
          </Button>
        ) : null}

        {update.status === 'available' ? (
          <Button size="sm" variant="outline" onClick={download}>
            Download update
          </Button>
        ) : null}

        {update.status === 'downloading' ? (
          <Button size="sm" variant="outline" disabled aria-busy>
            <Spinner size="sm" className="mr-2" />
            Downloading {progressLabel}
          </Button>
        ) : null}

        {update.status === 'downloaded' ? (
          <Button size="sm" variant="outline" onClick={install}>
            Restart and install
          </Button>
        ) : null}

        {update.status === 'error' ? (
          <div className="flex items-start gap-3">
            <div className="inline-flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 shadow-sm">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">
                  Updater unavailable — download manually
                </span>
                {update.message && (
                  <span className="text-xs text-muted-foreground">{update.message}</span>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={openLatest} className="self-start">
              Get latest DMG
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VersionCard;
