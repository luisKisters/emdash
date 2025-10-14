import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Trash } from 'lucide-react';

const LinearIntegrationCard: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'error'>(
    'unknown'
  );
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const markConnected = useCallback((name?: string | null) => {
    setStatus('connected');
    setWorkspaceName(name ?? null);
    setMessage(null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('linear:connected', 'true');
    }
  }, []);

  const markDisconnected = useCallback(() => {
    setStatus('disconnected');
    setWorkspaceName(null);
    setMessage('Disconnected');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('linear:connected');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      const api = window.electronAPI;
      if (!api?.linearCheckConnection) {
        setStatus('error');
        setMessage('Linear integration is unavailable in this build.');
        return;
      }

      try {
        const result = await api.linearCheckConnection();
        if (cancelled) return;

        if (result?.connected) {
          markConnected(result.workspaceName ?? null);
        } else {
          markDisconnected();
          if (result?.error) {
            setStatus('error');
            setMessage(result.error);
          }
        }
      } catch (error) {
        console.error('Failed to check Linear connection:', error);
        if (!cancelled) {
          setStatus('error');
          setMessage('Unable to verify Linear connection.');
        }
      }
    };

    checkConnection();
    return () => {
      cancelled = true;
    };
  }, [markConnected, markDisconnected]);

  const trimmedKey = apiKey.trim();
  const hasKeyInput = trimmedKey.length > 0;

  const handleConnect = async () => {
    if (!hasKeyInput) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const api = window.electronAPI;
      if (!api?.linearSaveToken) {
        throw new Error('Linear integration is unavailable in this build.');
      }

      const result = await api.linearSaveToken(trimmedKey);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to connect to Linear.');
      }

      markConnected(result.workspaceName ?? null);
      setApiKey('');
    } catch (error) {
      console.error('Linear connection failed:', error);
      setStatus('error');
      setMessage('Connection failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const api = window.electronAPI;
      if (!api?.linearClearToken) {
        throw new Error('Linear integration is unavailable in this build.');
      }

      const result = await api.linearClearToken();
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to disconnect from Linear.');
      }

      markDisconnected();
      setApiKey('');
    } catch (error) {
      console.error('Linear disconnection failed:', error);
      setStatus('error');
      setMessage('Failed to disconnect.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isConnected = status === 'connected';
  const isIdleConnected = isConnected && !hasKeyInput && !isSubmitting;
  const buttonLabel = isSubmitting ? 'Working…' : isIdleConnected ? 'Connected' : 'Connect';

  return (
    <div className="space-y-3">
      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
              <span className="text-sm font-medium text-foreground">
                Connected{workspaceName ? ` · ${workspaceName}` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
              title="Disconnect Linear"
              aria-label="Disconnect Linear"
            >
              {isSubmitting ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
              ) : (
                <Trash className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Linear integration is active. You can now select Linear issues when creating workspaces.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              id="linear-api-key"
              type="password"
              placeholder="lin_api_..."
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={isSubmitting}
            />
            <Button type="button" onClick={handleConnect} disabled={isSubmitting || !hasKeyInput}>
              {buttonLabel}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Paste a Linear personal API key.</p>
        </div>
      )}

      {message ? (
        <div
          className={`text-sm ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
};

export default LinearIntegrationCard;
