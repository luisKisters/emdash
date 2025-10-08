import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { X, GitBranch, Plus, Search, Loader2 } from 'lucide-react';
import { ProviderSelector } from './ProviderSelector';
import { type Provider } from '../types';
import { Separator } from './ui/separator';
import { type LinearIssueSummary } from '../types/linear';

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
  const [issueSearchTerm, setIssueSearchTerm] = useState('');
  const [issueSearchResults, setIssueSearchResults] = useState<LinearIssueSummary[]>([]);
  const [issueSearchError, setIssueSearchError] = useState<string | null>(null);
  const [isSearchingIssues, setIsSearchingIssues] = useState(false);
  const [isIssueDropdownOpen, setIsIssueDropdownOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssueSummary | null>(null);
  const issueInputRef = useRef<HTMLInputElement | null>(null);
  const issueDropdownRef = useRef<HTMLDivElement | null>(null);
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

  const canSearchLinear =
    typeof window !== 'undefined' && !!window.electronAPI?.linearSearchIssues;

  useEffect(() => {
    if (!isIssueDropdownOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (issueDropdownRef.current?.contains(target)) return;
      if (issueInputRef.current?.contains(target)) return;
      setIsIssueDropdownOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsIssueDropdownOpen(false);
        issueInputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isIssueDropdownOpen]);

  useEffect(() => {
    if (!canSearchLinear || !isIssueDropdownOpen) return;

    const term = issueSearchTerm.trim();
    if (!term) {
      setIssueSearchResults([]);
      setIssueSearchError(null);
      setIsSearchingIssues(false);
      return;
    }

    setIsSearchingIssues(true);
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const api = window.electronAPI;
        if (!api?.linearSearchIssues) {
          throw new Error('Linear search unavailable in this build.');
        }
        const result = await api.linearSearchIssues(term, 8);
        if (cancelled) return;
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to search Linear issues.');
        }
        setIssueSearchResults(result.issues ?? []);
        setIssueSearchError(null);
      } catch (error) {
        if (cancelled) return;
        setIssueSearchResults([]);
        setIssueSearchError(
          error instanceof Error ? error.message : 'Failed to search Linear issues.'
        );
      } finally {
        if (!cancelled) {
          setIsSearchingIssues(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [issueSearchTerm, canSearchLinear, isIssueDropdownOpen]);

  const handleSelectIssue = (issue: LinearIssueSummary) => {
    setSelectedIssue(issue);
    setIssueSearchTerm(issue.identifier);
    setIssueSearchResults([]);
    setIssueSearchError(null);
    setIsIssueDropdownOpen(false);
  };

  const handleIssueInputChange = (value: string) => {
    setSelectedIssue(null);
    setIssueSearchTerm(value);
    if (canSearchLinear && !isIssueDropdownOpen) {
      setIsIssueDropdownOpen(true);
    }
  };

  const issueHelperText = (() => {
    if (!canSearchLinear) {
      return 'Connect Linear in Settings to search issues.';
    }
    if (selectedIssue) {
      return selectedIssue.title;
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
                            <div className="relative flex-1" ref={issueDropdownRef}>
                              <Input
                                id="linear-issue"
                                ref={issueInputRef}
                                value={issueSearchTerm}
                                onFocus={() => {
                                  if (canSearchLinear) {
                                    setIsIssueDropdownOpen(true);
                                  }
                                }}
                                onChange={(event) => handleIssueInputChange(event.target.value)}
                                placeholder={
                                  canSearchLinear ? 'Search Linear issues…' : 'Linear search unavailable'
                                }
                                className="w-full pr-10"
                                autoComplete="off"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {isSearchingIssues ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Search className="h-4 w-4" aria-hidden="true" />
                                )}
                              </span>

                              {isIssueDropdownOpen && canSearchLinear && (
                                <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
                                  {issueSearchError ? (
                                    <div className="px-3 py-2 text-xs text-destructive">
                                      {issueSearchError}
                                    </div>
                                  ) : issueSearchTerm.trim().length === 0 ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                      Start typing to search your Linear issues.
                                    </div>
                                  ) : issueSearchResults.length === 0 && !isSearchingIssues ? (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                      No issues found.
                                    </div>
                                  ) : (
                                    <div className="max-h-60 overflow-y-auto py-1">
                                      {issueSearchResults.map((issue) => (
                                        <button
                                          key={issue.id || issue.identifier}
                                          type="button"
                                          onClick={() => handleSelectIssue(issue)}
                                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted/80"
                                        >
                                          <div className="font-medium text-foreground">
                                            {issue.identifier}
                                          </div>
                                          <div className="text-xs text-muted-foreground truncate">
                                            {issue.title}
                                          </div>
                                          <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                                            {issue.team?.key ? <span>{issue.team.key}</span> : null}
                                            {issue.state?.name ? <span>{issue.state.name}</span> : null}
                                            {issue.assignee?.displayName
                                              ? <span>{issue.assignee.displayName}</span>
                                              : null}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {issueHelperText ? (
                                <p className="mt-2 text-xs text-muted-foreground">{issueHelperText}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>

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
