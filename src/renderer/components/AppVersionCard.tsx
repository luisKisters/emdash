import React, { useEffect, useState } from 'react';

const AppVersionCard: React.FC = () => {
  const [electronVersion, setElectronVersion] = useState<string>('...');
  const [emdashVersion, setEmdashVersion] = useState<string>('...');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const loadVersionInfo = async () => {
      try {
        const [appVersion, appPlatform] = await Promise.all([
          window.electronAPI.getVersion(),
          window.electronAPI.getPlatform(),
        ]);
        if (!cancelled) {
          setElectronVersion(appVersion);
          setPlatform(appPlatform);
        }
      } catch (error) {
        console.error('Failed to load version info:', error);
        if (!cancelled) {
          setElectronVersion('Unknown');
        }
      }
    };

    loadVersionInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">emdash</span>
          <code className="text-sm font-mono text-muted-foreground">{emdashVersion}</code>
        </div>
      </div>

      <div className="flex-1 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">Electron</span>
          <code className="text-sm font-mono text-muted-foreground">{electronVersion}</code>
        </div>
        {platform && <p className="text-xs text-muted-foreground">Platform: {platform}</p>}
      </div>
    </div>
  );
};

export default AppVersionCard;
