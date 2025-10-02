import { useCallback, useEffect, useState } from 'react';

type GithubUser = any;

export function useGithubAuth() {
  const [installed, setInstalled] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.githubGetStatus();
      setInstalled(!!status?.installed);
      setAuthenticated(!!status?.authenticated);
      setUser(status?.user || null);
      return status;
    } catch (e) {
      setInstalled(false);
      setAuthenticated(false);
      setUser(null);
      return { installed: false, authenticated: false };
    }
  }, []);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.githubAuth();
      if (result?.success) {
        setAuthenticated(true);
        setUser(result.user || null);
      } else {
        setAuthenticated(false);
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await window.electronAPI.githubLogout();
    } finally {
      setAuthenticated(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    installed,
    authenticated,
    user,
    isLoading,
    checkStatus,
    login,
    logout,
  };
}
