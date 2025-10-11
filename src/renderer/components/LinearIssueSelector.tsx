import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger } from './ui/select';
import linearLogo from '../../assets/images/linear.png';
import { type LinearIssueSummary } from '../types/linear';

interface LinearIssueSelectorProps {
  selectedIssue: LinearIssueSummary | null;
  onIssueChange: (issue: LinearIssueSummary | null) => void;
  isOpen?: boolean;
  className?: string;
}

export const LinearIssueSelector: React.FC<LinearIssueSelectorProps> = ({
  selectedIssue,
  onIssueChange,
  isOpen = false,
  className = '',
}) => {
  const [availableIssues, setAvailableIssues] = useState<LinearIssueSummary[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [issueListError, setIssueListError] = useState<string | null>(null);
  const [hasRequestedIssues, setHasRequestedIssues] = useState(false);
  const isMountedRef = useRef(true);

  const canListLinear = typeof window !== 'undefined' && !!window.electronAPI?.linearListIssues;
  const issuesLoaded = availableIssues.length > 0;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setAvailableIssues([]);
      setHasRequestedIssues(false);
      setIssueListError(null);
      setIsLoadingIssues(false);
      onIssueChange(null);
    }
  }, [isOpen, onIssueChange]);

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
      setIssueListError(error instanceof Error ? error.message : 'Failed to load Linear issues.');
    } finally {
      if (!isMountedRef.current) return;
      setIsLoadingIssues(false);
      setHasRequestedIssues(true);
    }
  }, [canListLinear]);

  useEffect(() => {
    if (!isOpen || !canListLinear) {
      return;
    }
    if (isLoadingIssues || hasRequestedIssues) {
      return;
    }
    loadLinearIssues();
  }, [isOpen, canListLinear, isLoadingIssues, hasRequestedIssues, loadLinearIssues]);

  const retryLoadIssues = () => {
    if (isLoadingIssues) return;
    setIssueListError(null);
    setAvailableIssues([]);
    setHasRequestedIssues(false);
  };

  const handleIssueSelect = (identifier: string) => {
    const issue = availableIssues.find((issue) => issue.identifier === identifier) ?? null;
    onIssueChange(issue);
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

  const issuePlaceholder = isLoadingIssues
    ? 'Loading…'
    : issueListError
      ? 'Unable to load issues'
      : 'Select a Linear issue';

  if (!canListLinear) {
    return (
      <div className={className}>
        <Input value="" placeholder="Linear integration unavailable" disabled />
        <p className="mt-2 text-xs text-muted-foreground">
          Connect Linear in Settings to browse issues.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select
        value={selectedIssue?.identifier || undefined}
        onValueChange={handleIssueSelect}
        disabled={isLoadingIssues || !!issueListError || !issuesLoaded}
      >
        <SelectTrigger className="h-9 w-full border-none bg-gray-100 dark:bg-gray-700">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left text-foreground">
            {selectedIssue ? (
              <>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-800">
                  <img src={linearLogo} alt="Linear" className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium text-foreground">
                    {selectedIssue.identifier}
                  </span>
                </span>
                {selectedIssue.title ? (
                  <>
                    <span className="shrink-0 text-foreground">-</span>
                    <span className="truncate">{selectedIssue.title}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <img src={linearLogo} alt="Linear" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{issuePlaceholder}</span>
              </>
            )}
          </div>
        </SelectTrigger>
        <SelectContent side="top">
          {availableIssues.map((issue) => (
            <SelectItem key={issue.id || issue.identifier} value={issue.identifier}>
              <SelectItemText>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-800">
                    <img src={linearLogo} alt="Linear" className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium text-foreground">
                      {issue.identifier}
                    </span>
                  </span>
                  {issue.title ? (
                    <>
                      <span className="truncate text-muted-foreground">{issue.title}</span>
                    </>
                  ) : null}
                </span>
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
        <p className="mt-2 text-xs text-muted-foreground">{issueHelperText}</p>
      ) : null}
    </div>
  );
};

export default LinearIssueSelector;
