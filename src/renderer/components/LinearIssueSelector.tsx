import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger } from './ui/select';
import { Search } from 'lucide-react';
import linearLogo from '../../assets/images/linear.png';
import { type LinearIssueSummary } from '../types/linear';
import { Separator } from './ui/separator';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<LinearIssueSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const isMountedRef = useRef(true);

  const canListLinear = typeof window !== 'undefined' && !!window.electronAPI?.linearInitialFetch;
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
      setSearchTerm('');
      setSearchResults([]);
      setIsSearching(false);
      onIssueChange(null);
    }
  }, [isOpen, onIssueChange]);

  const loadLinearIssues = useCallback(async () => {
    if (!canListLinear) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.linearInitialFetch) {
      setAvailableIssues([]);
      setIssueListError('Linear issue list unavailable in this build.');
      setHasRequestedIssues(true);
      return;
    }

    setIsLoadingIssues(true);
    try {
      const result = await api.linearInitialFetch();
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

  const searchIssues = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const api = window.electronAPI;
    if (!api?.linearSearchIssues) {
      return;
    }

    setIsSearching(true);
    try {
      const result = await api.linearSearchIssues(term.trim(), 20);
      if (!isMountedRef.current) return;
      if (result?.success) {
        setSearchResults(result.issues ?? []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setSearchResults([]);
    } finally {
      if (!isMountedRef.current) return;
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchIssues(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchIssues]);

  // Combine search results and available issues
  const displayIssues = useMemo(() => {
    if (searchTerm.trim()) {
      return searchResults;
    }
    return availableIssues;
  }, [searchTerm, searchResults, availableIssues]);

  const handleIssueSelect = (identifier: string) => {
    const issue = displayIssues.find((issue) => issue.identifier === identifier) ?? null;
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
          <div className="relative px-3 py-2">
            <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, ID, or assignee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 w-full border-none bg-transparent pl-9 pr-3 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <Separator />
          {displayIssues.length > 0 ? (
            displayIssues.map((issue) => (
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
            ))
          ) : searchTerm.trim() ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {isSearching ? 'Searching...' : `No issues found for "${searchTerm}"`}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">No issues available</div>
          )}
        </SelectContent>
      </Select>
      {issueListError ? (
        <div className="mt-2 text-xs text-destructive">
          <span>Linear token not set. Connect Linear in Settings to browse issues.</span>
        </div>
      ) : null}
      {issueHelperText ? (
        <p className="mt-2 text-xs text-muted-foreground">{issueHelperText}</p>
      ) : null}
    </div>
  );
};

export default LinearIssueSelector;
