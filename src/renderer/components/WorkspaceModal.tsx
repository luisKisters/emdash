import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { X, GitBranch } from 'lucide-react';
import { ProviderSelector } from './ProviderSelector';
import { type Provider } from '../types';
import { Separator } from './ui/separator';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWorkspace: (name: string, initialPrompt?: string, selectedProvider?: Provider) => void;
  projectName: string;
  defaultBranch: string;
  existingNames?: string[];
}

const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreateWorkspace,
  projectName,
  defaultBranch,
  existingNames = [],
}) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('codex');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const normalizedExisting = existingNames.map((n) => n.toLowerCase());

  // Convert input to valid workspace name format
  const convertToWorkspaceName = (input: string): string => {
    return input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[^a-z0-9-]/g, '') // Remove invalid characters
      .replace(/-+/g, '-') // Replace multiple consecutive hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  const validate = (value: string): string | null => {
    const name = value.trim();
    if (!name) return 'Please enter a workspace name.';

    const convertedName = convertToWorkspaceName(name);
    if (!convertedName) return 'Please enter a valid workspace name.';

    if (normalizedExisting.includes(convertedName)) {
      return 'A workspace with this name already exists.';
    }
    if (convertedName.length > 64) {
      return 'Name is too long (max 64 characters).';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const err = validate(workspaceName);
    if (err) {
      setError(err);
      return;
    }

    setIsCreating(true);
    try {
      await onCreateWorkspace(
        convertToWorkspaceName(workspaceName),
        showAdvanced ? initialPrompt.trim() || undefined : undefined,
        showAdvanced ? selectedProvider : undefined
      );
      setWorkspaceName('');
      setInitialPrompt('');
      setSelectedProvider('codex');
      setShowAdvanced(false);
      setError(null);
      onClose();
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const onChange = (val: string) => {
    if (!touched) setTouched(true);
    setWorkspaceName(val);
    setError(validate(val));
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.1, ease: 'easeOut' }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 6, scale: 0.995 }
            }
            transition={
              shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
            }
            className="w-full max-w-md mx-4 will-change-transform transform-gpu"
          >
            <Card className="w-full relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="absolute top-2 right-2 h-8 w-8 p-0 z-10"
              >
                <X className="h-4 w-4" />
              </Button>
              <CardHeader className="space-y-1 pb-2 pr-12">
                <CardTitle className="text-lg">New Workspace</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {projectName} • from origin/{defaultBranch}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <Separator className="mb-2" />
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="workspace-name" className="block text-sm font-medium text-foreground">
                      Task name
                    </label>
                    <Input
                      id="workspace-name"
                      value={workspaceName}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={() => setTouched(true)}
                      placeholder="e.g. Refactor API routes"
                      className="w-full"
                      aria-invalid={touched && !!error}
                      aria-describedby="workspace-name-error"
                      autoFocus
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      A short name for this workspace or branch.
                    </p>
                    {touched && error && (
                      <p id="workspace-name-error" className="mt-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}
                  </div>

                  {workspaceName && (
                    <div className="flex items-center space-x-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <GitBranch className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-sm text-gray-600 dark:text-gray-400 break-all overflow-hidden">
                        {convertToWorkspaceName(workspaceName)}
                      </span>
                    </div>
                  )}

                  <Separator />

                  <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className="w-full rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    aria-expanded={showAdvanced}
                    aria-controls="workspace-advanced"
                  >
                    ⚙️ Advanced — Choose agent and start with an initial prompt.
                  </button>

                  {showAdvanced && (
                    <div id="workspace-advanced" className="space-y-4">
                      <div>
                        <label htmlFor="provider-selector" className="block text-sm font-medium text-foreground">
                          AI provider
                        </label>
                        <ProviderSelector
                          value={selectedProvider}
                          onChange={setSelectedProvider}
                          className="mt-2 w-full"
                        />
                      </div>

                      {(selectedProvider === 'codex' || selectedProvider === 'claude') && (
                        <div>
                          <label htmlFor="initial-prompt" className="block text-sm font-medium text-foreground">
                            Initial prompt
                          </label>
                          <textarea
                            id="initial-prompt"
                            value={initialPrompt}
                            onChange={(e) => setInitialPrompt(e.target.value)}
                            placeholder="Describe what you'd like the agent to do first."
                            className="mt-2 w-full min-h-[80px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                            rows={3}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isCreating}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!!validate(workspaceName) || isCreating}
                    >
                      {isCreating ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Creating...
                        </>
                      ) : (
                        'Create'
                      )}
                    </Button>
                  </div>
                </form>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-muted-foreground">
                    This will run your workspace setup script.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default WorkspaceModal;
