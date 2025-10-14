import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { X, Settings2, Cable } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import VersionCard from './VersionCard';
import IntegrationsCard from './IntegrationsCard';
import CliProvidersList from './CliProvidersList';
import TelemetryCard from './TelemetryCard';
import { CliProviderStatus } from '../types/connections';
import { Separator } from './ui/separator';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'connections';

interface SettingsSection {
  title: string;
  description?: string;
  action?: React.ReactNode;
  render?: () => React.ReactNode;
}
const ORDERED_TABS: SettingsTab[] = ['general', 'connections'];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [cliProviders, setCliProviders] = useState<CliProviderStatus[]>([]);
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliLoading, setCliLoading] = useState<boolean>(false);
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

  const fetchCliProviders = useCallback(async () => {
    if (!window?.electronAPI?.getCliProviders) {
      setCliProviders([]);
      setCliError('CLI detection is unavailable in this build.');
      return;
    }

    setCliLoading(true);
    setCliError(null);

    try {
      const result = await window.electronAPI.getCliProviders();
      if (result?.success && Array.isArray(result.providers)) {
        setCliProviders(result.providers);
      } else {
        setCliProviders([]);
        setCliError(result?.error || 'Failed to detect CLI providers.');
      }
    } catch (error) {
      console.error('CLI detection failed:', error);
      setCliProviders([]);
      setCliError('Unable to detect CLI providers.');
    } finally {
      setCliLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'connections') {
      fetchCliProviders();
    }
  }, [isOpen, activeTab, fetchCliProviders]);

  const tabDetails = useMemo(() => {
    const base = {
      general: {
        icon: Settings2,
        label: 'General',
        title: 'General',
        description: '',
        sections: [
          {
            title: 'Telemetry',
            render: () => <TelemetryCard />,
          },
          {
            title: 'Version',
            render: () => <VersionCard />,
          },
        ],
      },
      connections: {
        icon: Cable,
        label: 'Connections',
        title: 'Connections',
        description: '',
        sections: [
          {
            title: 'Integrations',
            description: '',
            render: () => <IntegrationsCard />,
          },
          {
            title: 'CLI providers',
            render: () => (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchCliProviders}
                  disabled={cliLoading}
                  aria-busy={cliLoading}
                >
                  {cliLoading ? 'Detecting…' : 'Detect CLIs'}
                </Button>
                <CliProvidersList
                  providers={cliProviders}
                  isLoading={cliLoading}
                  error={cliError}
                />
              </div>
            ),
          },
        ],
      },
    } satisfies Record<
      SettingsTab,
      {
        icon: LucideIcon;
        label: string;
        title: string;
        description: string;
        sections: SettingsSection[];
      }
    >;

    return base;
  }, [cliProviders, cliLoading, cliError, fetchCliProviders]);

  const activeTabDetails = tabDetails[activeTab];

  const renderContent = () => {
    const { sections } = activeTabDetails;

    if (!sections.length) {
      return null;
    }

    return (
      <div className="space-y-6">
        {sections.map((section: SettingsSection, index) => {
          let renderedContent: React.ReactNode = null;
          if (typeof section.render === 'function') {
            renderedContent = section.render();
          } else if (!section.description) {
            renderedContent = <p className="text-sm text-muted-foreground">Coming soon.</p>;
          }

          return (
          <React.Fragment key={section.title}>
            {index > 0 ? <Separator className="border-border/60" /> : null}
            <section className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{section.title}</h3>
                  {section.action ? <div>{section.action}</div> : null}
                </div>
                {section.description ? (
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                ) : null}
              </div>
              {renderedContent ? <div className="flex flex-col gap-3">{renderedContent}</div> : null}
            </section>
          </React.Fragment>
        );
        })}
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
            className="mx-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-border/50 bg-background shadow-2xl"
          >
            <div className="flex h-[520px]">
              <aside className="w-60 border-r border-border/60 bg-muted/20 p-6">
                <nav className="space-y-1">
                  {ORDERED_TABS.map((tab) => {
                    const { icon: Icon, label } = tabDetails[tab];

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          activeTab === tab
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/60'
                        }`}
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

                <div className="flex-1 overflow-y-auto px-6 py-6">{renderContent()}</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SettingsModal;
