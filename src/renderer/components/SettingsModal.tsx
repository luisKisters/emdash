import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'account';

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

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Account</h2>
              <p className="text-sm text-muted-foreground">
                Manage your personal details and authentication preferences.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                Account settings will appear here soon.
              </p>
            </div>
          </div>
        );
      case 'general':
      default:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">General</h2>
              <p className="text-sm text-muted-foreground">
                Customize your default experience across emdash.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                General configuration options will appear here soon.
              </p>
            </div>
          </div>
        );
    }
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
                <div className="mb-6">
                  <h1 className="text-xl font-semibold">Settings</h1>
                  <p className="text-xs text-muted-foreground">Configure how emdash behaves.</p>
                </div>
                <nav className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${activeTab === 'general' ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                  >
                    <span>General</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${activeTab === 'account' ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                  >
                    <span>Account</span>
                  </button>
                </nav>
              </aside>

              <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                  <div>
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {activeTab}
                    </span>
                    <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
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
