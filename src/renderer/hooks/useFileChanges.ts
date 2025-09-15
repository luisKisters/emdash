import { useState, useEffect } from 'react';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  diff?: string;
}

export function useFileChanges(workspacePath: string) {
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFileChanges = async () => {
      if (!workspacePath) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        // Call the main process to get git status
        const result = await window.electronAPI.getGitStatus(workspacePath);
        
        if (result?.success && result.changes && result.changes.length > 0) {
          const changes: FileChange[] = result.changes.map((change: any) => ({
            path: change.path,
            status: change.status,
            additions: change.additions || 0,
            deletions: change.deletions || 0,
            diff: change.diff,
          }));
          setFileChanges(changes);
        } else {
          // No changes detected - set empty array
          setFileChanges([]);
        }
      } catch (err) {
        console.error('Failed to fetch file changes:', err);
        setError('Failed to load file changes');
        // No changes on error - set empty array
        setFileChanges([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileChanges();
    
    // Set up polling for file changes every 5 seconds
    const interval = setInterval(fetchFileChanges, 5000);
    
    return () => clearInterval(interval);
  }, [workspacePath]);

  const refreshChanges = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getGitStatus(workspacePath);
      if (result?.success && result.changes && result.changes.length > 0) {
        const changes: FileChange[] = result.changes.map((change: any) => ({
          path: change.path,
          status: change.status,
          additions: change.additions || 0,
          deletions: change.deletions || 0,
          diff: change.diff,
        }));
        setFileChanges(changes);
      } else {
        setFileChanges([]);
      }
    } catch (err) {
      console.error('Failed to refresh file changes:', err);
      setFileChanges([]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    fileChanges,
    isLoading,
    error,
    refreshChanges,
  };
}
