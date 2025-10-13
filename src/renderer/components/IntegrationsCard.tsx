import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Workflow, Github, Loader2, Trash2, CheckCircle2, ExternalLink, LogOut } from 'lucide-react';
import ProviderRow from './ProviderRow';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useGithubAuth } from '../hooks/useGithubAuth';

type LinearState = {
  checking: boolean;
  loading: boolean;
  connected: boolean;
  detail: string | null;
  input: string;
  error: string | null;
};

const defaultLinearState: LinearState = {
  checking: true,
  loading: false,
  connected: false,
  detail: null,
  input: '',
  error: null,
};

const IntegrationsCard: React.FC = () => {
  const [linearState, setLinearState] = useState<LinearState>(defaultLinearState);
  const { installed, authenticated, user, isLoading, login, logout, checkStatus } = useGithubAuth();
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubLogoutLoading, setGithubLogoutLoading] = useState(false);

  const loadLinearStatus = useCallback(async () => {
    if (!window?.electronAPI?.linearCheckConnection) {
      setLinearState((prev) => ({
        ...prev,
        checking: false,
        connected: false,
        detail: null,
        error: 'Linear integration unavailable.',
      }));
      return;
    }

    try {
      const status = await window.electronAPI.linearCheckConnection();
      setLinearState((prev) => ({
        ...prev,
        checking: false,
        connected: !!status?.connected,
        detail: status?.workspaceName ?? null,
        error: status?.connected ? null : null,
      }));
    } catch (error) {
      console.error('Failed to check Linear connection:', error);
      setLinearState((prev) => ({
        ...prev,
        checking: false,
        connected: false,
        detail: null,
        error: 'Unable to verify Linear connection.',
      }));
    }
  }, []);

  useEffect(() => {
    loadLinearStatus();
  }, [loadLinearStatus]);

  const handleLinearInputChange = useCallback((value: string) => {
    setLinearState((prev) => ({ ...prev, input: value, error: null }));
  }, []);

  const handleLinearConnect = useCallback(async () => {
    const token = linearState.input.trim();
    if (!token || !window?.electronAPI?.linearSaveToken) {
      return;
    }

    setLinearState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await window.electronAPI.linearSaveToken(token);
      if (result?.success) {
        setLinearState({
          checking: false,
          loading: false,
          connected: true,
          detail: result?.workspaceName ?? null,
          input: '',
          error: null,
        });
      } else {
        setLinearState((prev) => ({
          ...prev,
          loading: false,
          connected: false,
          detail: null,
          error: result?.error || 'Could not connect. Try again.',
        }));
      }
    } catch (error) {
      console.error('Linear connect failed:', error);
      setLinearState((prev) => ({
        ...prev,
        loading: false,
        connected: false,
        detail: null,
        error: 'Could not connect. Try again.',
      }));
    }
  }, [linearState.input]);

  const handleLinearKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!linearState.loading && !linearState.checking && linearState.input.trim()) {
          void handleLinearConnect();
        }
      }
    },
    [handleLinearConnect, linearState]
  );

  const handleLinearDisconnect = useCallback(async () => {
    if (!window?.electronAPI?.linearClearToken) {
      return;
    }

    setLinearState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await window.electronAPI.linearClearToken();
      if (result?.success) {
        setLinearState({
          checking: false,
          loading: false,
          connected: false,
          detail: null,
          input: '',
          error: null,
        });
      } else {
        setLinearState((prev) => ({
          ...prev,
          loading: false,
          error: result?.error || 'Failed to disconnect.',
        }));
      }
    } catch (error) {
      console.error('Linear disconnect failed:', error);
      setLinearState((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to disconnect.',
      }));
    }
  }, []);

  const linearMiddle = useMemo(() => {
    if (linearState.connected) {
      return (
        <div className="flex items-center gap-2 text-sm" aria-live="polite">
          <span className="font-medium text-foreground">Connected</span>
          {linearState.detail ? (
            <span className="text-xs text-muted-foreground">• {linearState.detail}</span>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-2" aria-live="polite">
        <Input
          type="password"
          value={linearState.input}
          onChange={(event) => handleLinearInputChange(event.target.value)}
          disabled={linearState.loading || linearState.checking}
          placeholder="Paste Linear API key..."
          onKeyDown={handleLinearKeyDown}
          aria-label="Linear API key"
        />
        {linearState.error ? (
          <p className="text-xs text-red-600" role="alert">
            {linearState.error}
          </p>
        ) : null}
      </div>
    );
  }, [handleLinearInputChange, handleLinearKeyDown, linearState]);

  const linearRight = useMemo(() => {
    if (linearState.connected) {
      return (
        <div className="flex items-center gap-2">
          <Badge className="flex items-center gap-1 bg-emerald-500/10 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Connected
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleLinearDisconnect()}
                disabled={linearState.loading}
                aria-label="Disconnect Linear"
              >
                {linearState.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Disconnect</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    const canConnect = !!linearState.input.trim() && !linearState.loading && !linearState.checking;

    return (
      <Button
        type="button"
        size="sm"
        onClick={() => void handleLinearConnect()}
        disabled={!canConnect}
      >
        {linearState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Connect
      </Button>
    );
  }, [handleLinearConnect, handleLinearDisconnect, linearState]);

  const githubDetail = useMemo(() => {
    if (!user) return null;
    return user?.name || user?.login || null;
  }, [user]);

  const handleGithubConnect = useCallback(async () => {
    setGithubError(null);
    try {
      const result = await login();
      await checkStatus();
      if (!result?.success) {
        setGithubError(result?.error || 'Could not connect.');
      }
    } catch (error) {
      console.error('GitHub connect failed:', error);
      setGithubError('Could not connect.');
    }
  }, [checkStatus, login]);

  const handleGithubDisconnect = useCallback(async () => {
    setGithubError(null);
    setGithubLogoutLoading(true);
    try {
      await logout();
      await checkStatus();
    } catch (error) {
      console.error('GitHub disconnect failed:', error);
      setGithubError('Failed to disconnect.');
    } finally {
      setGithubLogoutLoading(false);
    }
  }, [checkStatus, logout]);

  const handleGithubInstall = useCallback(async () => {
    try {
      await window.electronAPI.openExternal('https://cli.github.com/manual/installation');
    } catch (error) {
      console.error('Failed to open GitHub CLI install docs:', error);
    }
  }, []);

  const githubMiddle = useMemo(() => {
    if (!installed) {
      return (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Install GitHub CLI (gh) to connect.
        </p>
      );
    }

    if (authenticated) {
      return (
        <div className="flex items-center gap-2 text-sm" aria-live="polite">
          <span className="font-medium text-foreground">Connected</span>
          {githubDetail ? <span className="text-xs text-muted-foreground">• {githubDetail}</span> : null}
        </div>
      );
    }

    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Sign in with GitHub CLI.
      </p>
    );
  }, [authenticated, githubDetail, installed]);

  const githubRight = useMemo(() => {
    if (!installed) {
      return (
        <Button type="button" variant="outline" size="sm" onClick={() => void handleGithubInstall()}>
          <ExternalLink className="mr-2 h-4 w-4" /> Install CLI
        </Button>
      );
    }

    if (authenticated) {
      return (
        <div className="flex items-center gap-2">
          <Badge className="flex items-center gap-1 bg-emerald-500/10 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Connected
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleGithubDisconnect()}
                disabled={githubLogoutLoading}
                aria-label="Disconnect GitHub"
              >
                {githubLogoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Disconnect</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <Button
        type="button"
        size="sm"
        onClick={() => void handleGithubConnect()}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Sign in
      </Button>
    );
  }, [authenticated, githubLogoutLoading, handleGithubConnect, handleGithubDisconnect, handleGithubInstall, installed, isLoading]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
      <ProviderRow icon={Workflow} label="Linear" detail={null} middle={linearMiddle} right={linearRight} />
      {linearState.error && !linearState.connected ? (
        <span className="sr-only" aria-live="assertive">
          {linearState.error}
        </span>
      ) : null}
      <ProviderRow icon={Github} label="GitHub" detail={null} middle={githubMiddle} right={githubRight} />
      {githubError ? (
        <p className="px-4 text-xs text-red-600" role="alert">
          {githubError}
        </p>
      ) : null}
      </div>
    </TooltipProvider>
  );
};

export default IntegrationsCard;
