import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { X, Settings2, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'account';

interface SettingsSection {
  title: string;
  description?: string;
  Component?: React.ComponentType;
}

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
    setMessage(`Connected${name ? ` to ${name}` : ''}.`);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('linear:connected', 'true');
    }
  }, []);

  const markDisconnected = useCallback(() => {
    setStatus('disconnected');
    setWorkspaceName(null);
    setMessage('Not connected.');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('linear:connected');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      try {
        const api = window.electronAPI;
        if (api?.linearCheckConnection) {
          const result = await api.linearCheckConnection();
          if (cancelled) return;
          if (result?.connected) {
            markConnected(result.workspaceName ?? null);
          } else {
            markDisconnected();
          }
          return;
        }
      } catch (error) {
        console.error('Failed to check Linear connection:', error);
        if (!cancelled) {
          setStatus('error');
          setMessage('Unable to verify Linear connection.');
        }
        return;
      }

      if (!cancelled) {
        const cached =
          typeof window !== 'undefined' ? window.localStorage.getItem('linear:connected') : null;
        if (cached === 'true') {
          markConnected();
        } else {
          markDisconnected();
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
      if (api?.linearSaveToken) {
        const result = await api.linearSaveToken(trimmedKey);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to connect to Linear.');
        }
        markConnected(result.workspaceName ?? null);
      } else {
        console.warn('Linear IPC not available; falling back to local status only.');
        markConnected();
      }
      setApiKey('');
    } catch (error) {
      console.error('Linear connection failed:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to connect to Linear.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isConnected = status === 'connected';
  const isIdleConnected = isConnected && !hasKeyInput && !isSubmitting;
  const buttonLabel = isSubmitting ? 'Connecting…' : isIdleConnected ? 'Connected' : 'Connect';

  return (
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
        <Button
          type="button"
          onClick={handleConnect}
          disabled={isSubmitting || (!hasKeyInput && !isIdleConnected)}
          className={
            isIdleConnected
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
              : undefined
          }
        >
          {buttonLabel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste a Linear personal API key with read access to issues. Keys are stored securely in your
        system keychain.
      </p>

      {message && status === 'error' ? (
        <div className="text-sm text-red-600 dark:text-red-400">
          {message}
          {workspaceName ? ` Workspace: ${workspaceName}` : ''}
        </div>
      ) : null}
    </div>
  );
};

const TAB_DETAILS: Record<SettingsTab, {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  sections: SettingsSection[];
}> = {
  general: {
    icon: Settings2,
    label: 'General',
    title: 'General',
    description: '',
    sections: [
      {
        title: 'Workspace defaults',
        description: 'General configuration options will appear here soon.',
      },
    ],
  },
  account: {
    icon: User,
    label: 'Account',
    title: 'Account',
    description: '',
    sections: [
      {
        title: 'Linear integration',
        Component: LinearIntegrationCard,
      },
    ],
  },
};

const ORDERED_TABS: SettingsTab[] = ['general', 'account'];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (isOpen) {
      setActiveTab('general');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const activeTabDetails = TAB_DETAILS[activeTab];

  const renderContent = () => {
    const { sections } = activeTabDetails;

    if (!sections.length) {
      return null;
    }

    return (
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-4 rounded-lg border border-border/60 bg-muted/40 p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              {section.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              ) : null}
            </div>
            {section.Component ? (
              <section.Component />
            ) : !section.description ? (
              <p className="text-sm text-muted-foreground">Coming soon.</p>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.12, ease: 'easeOut' }}
          onClick={onClose}
        >
          <motion.div
            onClick={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 6, scale: 0.995 }
            }
            transition={
              shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
            }
            className="w-full max-w-3xl mx-4 overflow-hidden rounded-2xl border border-border/50 bg-background shadow-2xl"
          >
            <div className="flex h-[520px]">
              <aside className="w-60 border-r border-border/60 bg-muted/20 p-6">
                <nav className="space-y-1">
                  {ORDERED_TABS.map((tab) => {
                    const { icon: Icon, label } = TAB_DETAILS[tab];

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${activeTab === tab ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          <span>{label}</span>
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </aside>

                <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">{activeTabDetails.title}</h2>
                    {activeTabDetails.description.trim() && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeTabDetails.description}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8"
                    aria-label="Close settings"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                  {renderContent()}
                </div>

                <Separator />
                <footer className="flex items-center justify-end gap-2 px-6 py-4">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Close
                  </Button>
                  <Button type="button" disabled>
                    Save changes
                  </Button>
                </footer>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  , document.body);
};

export default SettingsModal;
