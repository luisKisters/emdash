import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { X, GitBranch } from 'lucide-react';
import { ProviderSelector } from './ProviderSelector';
import { type Provider } from '../types';
import { Separator } from './ui/separator';
import { type LinearIssueSummary } from '../types/linear';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from './ui/select';

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
  const [availableIssues, setAvailableIssues] = useState<LinearIssueSummary[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issueListError, setIssueListError] = useState<string | null>(null);
  const [selectedIssueIdentifier, setSelectedIssueIdentifier] = useState<string>('');
  const [hasRequestedIssues, setHasRequestedIssues] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const selectedIssue = useMemo(
    () =>
      availableIssues.find((issue) => issue.identifier === selectedIssueIdentifier) ?? null,
    [availableIssues, selectedIssueIdentifier]
  );
  const issuesLoaded = availableIssues.length > 0;

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
      setSelectedIssueIdentifier('');
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

  const canListLinear =
    typeof window !== 'undefined' && !!window.electronAPI?.linearListIssues;

  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadLinearIssues = useCallback(async () => {
    if (!canListLinear) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.linearListIssues) {
      setAvailableIssues([]);
      setIssueListError('Linear issue list unavailable in this build.');
      setHasRequestedIssues(true);
      return;
    }

    setIsLoadingIssues(true);
    try {
      const result = await api.linearListIssues();
      if (!isMountedRef.current) return;
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to load Linear issues.');
      }
      setAvailableIssues(result.issues ?? []);
      setIssueListError(null);
    } catch (error) {
      if (!isMountedRef.current) return;
      setAvailableIssues([]);
      setIssueListError(
        error instanceof Error ? error.message : 'Failed to load Linear issues.'
      );
    } finally {
      if (!isMountedRef.current) return;
      setIsLoadingIssues(false);
      setHasRequestedIssues(true);
    }
  }, [canListLinear]);

  useEffect(() => {
    if (!isOpen || !showAdvanced || !canListLinear) {
      return;
    }
    if (isLoadingIssues || hasRequestedIssues) {
      return;
    }
    loadLinearIssues();
  }, [isOpen, showAdvanced, canListLinear, isLoadingIssues, hasRequestedIssues, loadLinearIssues]);

  const retryLoadIssues = () => {
    if (isLoadingIssues) return;
    setIssueListError(null);
    setAvailableIssues([]);
    setHasRequestedIssues(false);
  };

  const issueHelperText = (() => {
    if (!canListLinear) {
      return 'Connect Linear in Settings to browse issues.';
    }
    if (hasRequestedIssues && !isLoadingIssues && !issuesLoaded && !issueListError) {
      return 'No Linear issues available.';
    }
    return null;
  })();

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
                      placeholder="e.g. refactorApiRoutes"
                      className="w-full"
                      aria-invalid={touched && !!error}
                      aria-describedby="workspace-name-error"
                      autoFocus
                    />
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

                  <Accordion
                    type="single"
                    collapsible
                    value={showAdvanced ? 'advanced' : undefined}
                    onValueChange={(val) => setShowAdvanced(val === 'advanced')}
                    className="space-y-2"
                  >
                    <AccordionItem value="advanced" className="border-none">
                      <AccordionTrigger className="px-0 py-1 text-sm font-medium text-muted-foreground hover:no-underline">
                          Advanced options
                      </AccordionTrigger>
                      <AccordionContent
                        className="px-0 pt-2 space-y-4"
                        contentClassName="overflow-visible"
                        id="workspace-advanced"
                      >
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

                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-4">
                            <label
                              htmlFor="provider-selector"
                              className="w-32 shrink-0 text-sm font-medium text-foreground"
                            >
                              AI provider
                            </label>
                            <div className="flex-1">
                              <ProviderSelector
                                value={selectedProvider}
                                onChange={setSelectedProvider}
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <label
                              htmlFor="linear-issue"
                              className="w-32 shrink-0 text-sm font-medium text-foreground"
                            >
                              Linear issue
                            </label>
                            <div className="flex-1">
                              {canListLinear ? (
                                <>
                                  <Select
                                    value={selectedIssueIdentifier || undefined}
                                    onValueChange={setSelectedIssueIdentifier}
                                    disabled={isLoadingIssues || !!issueListError || !issuesLoaded}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue
                                        placeholder={
                                          isLoadingIssues
                                            ? 'Loading issues…'
                                            : issueListError
                                              ? 'Unable to load issues'
                                              : 'Select a Linear issue'
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent side="top">
                                      {availableIssues.map((issue) => (
                                        <SelectItem
                                          key={issue.id || issue.identifier}
                                          value={issue.identifier}
                                        >
                                          <SelectItemText>
                                            {issue.identifier}
                                            {issue.title ? ` - ${issue.title}` : ''}
                                          </SelectItemText>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {issueListError ? (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
                                      <span className="truncate">{issueListError}</span>
                                      <button
                                        type="button"
                                        onClick={retryLoadIssues}
                                        className="font-medium underline-offset-2 hover:underline"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  ) : null}
                                  {issueHelperText ? (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      {issueHelperText}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <Input
                                    id="linear-issue"
                                    value=""
                                    placeholder="Linear integration unavailable"
                                    disabled
                                  />
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Connect Linear in Settings to browse issues.
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

                  <div className="flex justify-end">
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
