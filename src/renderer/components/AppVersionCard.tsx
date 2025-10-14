import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; info?: any }
  | { status: 'not-available' }
  | { status: 'downloading'; progress?: { percent?: number; transferred?: number; total?: number } }
  | { status: 'downloaded' }
  | { status: 'error'; message: string };

const AppVersionCard: React.FC = () => {
  const [electronVersion, setElectronVersion] = useState<string>('...');
  const [emdashVersion, setEmdashVersion] = useState<string>('...');
  const [platform, setPlatform] = useState<string>('');
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

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

  useEffect(() => {
    const off = window.electronAPI.onUpdateEvent?.((evt) => {
      switch (evt.type) {
        case 'checking':
          setUpdate({ status: 'checking' });
          break;
        case 'available':
          setUpdate({ status: 'available', info: evt.payload });
          break;
        case 'not-available':
          setUpdate({ status: 'not-available' });
          break;
        case 'download-progress':
          setUpdate({ status: 'downloading', progress: evt.payload });
          break;
        case 'downloaded':
          setUpdate({ status: 'downloaded' });
          break;
        case 'error':
          setUpdate({ status: 'error', message: evt.payload?.message || 'Update error' });
          break;
        default:
          break;
      }
    });
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, []);

  const onCheck = async () => {
    setUpdate({ status: 'checking' });
    const res = await window.electronAPI.checkForUpdates();
    if (!res.success) {
      setUpdate({ status: 'error', message: res.error || 'Failed to check for updates' });
    }
  };

  const onDownload = async () => {
    setUpdate({ status: 'downloading' });
    const res = await window.electronAPI.downloadUpdate();
    if (!res.success) {
      setUpdate({ status: 'error', message: res.error || 'Failed to download update' });
    }
  };

  const onInstall = async () => {
    await window.electronAPI.quitAndInstallUpdate();
  };

  const onOpenLatest = async () => {
    await window.electronAPI.openLatestDownload();
  };

  const progressLabel = useMemo(() => {
    if (update.status !== 'downloading') return '';
    const p = update.progress?.percent ?? 0;
    return `${p.toFixed(0)}%`;
  }, [update]);

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
          <Button size="sm" onClick={onCheck}>
            Check for updates
          </Button>
        ) : null}

        {update.status === 'checking' ? (
          <Button size="sm" disabled>
            Checking...
          </Button>
        ) : null}

        {update.status === 'available' ? (
          <Button size="sm" onClick={onDownload}>
            Download update
          </Button>
        ) : null}

        {update.status === 'downloading' ? (
          <Button size="sm" disabled>
            Downloading {progressLabel}
          </Button>
        ) : null}

        {update.status === 'downloaded' ? (
          <Button size="sm" onClick={onInstall}>
            Restart and install
          </Button>
        ) : null}

        {update.status === 'error' ? (
          <>
            <span className="text-xs text-muted-foreground">
              Updater unavailable — download manually
            </span>
            <Button size="sm" variant="outline" onClick={onOpenLatest}>
              Get latest DMG
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AppVersionCard;
