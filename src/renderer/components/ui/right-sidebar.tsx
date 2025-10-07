import * as React from 'react';

interface RightSidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
  width: number;
  setWidth: (next: number) => void;
}

const RightSidebarContext = React.createContext<RightSidebarContextValue | undefined>(undefined);

const COLLAPSED_STORAGE_KEY = 'emdash.rightSidebarCollapsed.v2';
const WIDTH_STORAGE_KEY = 'emdash.rightSidebarWidth';
const DEFAULT_WIDTH = 320; // Tailwind w-80 => 20rem => 320px

export interface RightSidebarProviderProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  defaultWidth?: number;
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === 'true';
  } catch {
    return fallback;
  }
}

function readStoredNumber(key: string, fallback: number) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number.parseInt(stored, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function RightSidebarProvider({
  children,
  defaultCollapsed = true,
  defaultWidth = DEFAULT_WIDTH,
}: RightSidebarProviderProps) {
  const [collapsed, setCollapsedState] = React.useState<boolean>(() =>
    readStoredBoolean(COLLAPSED_STORAGE_KEY, defaultCollapsed)
  );
  const [width, setWidthState] = React.useState<number>(() =>
    readStoredNumber(WIDTH_STORAGE_KEY, defaultWidth)
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch {
      // ignore persistence errors
    }
  }, [collapsed]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch {
      // ignore persistence errors
    }
  }, [width]);

  const setCollapsed = React.useCallback((next: boolean) => {
    setCollapsedState(next);
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsedState((prev) => !prev);
  }, []);

  const setWidth = React.useCallback((next: number) => {
    setWidthState((prev) => {
      if (!Number.isFinite(next) || next <= 0) return prev;
      return next;
    });
  }, []);

  const value = React.useMemo<RightSidebarContextValue>(
    () => ({ collapsed, toggle, setCollapsed, width, setWidth }),
    [collapsed, toggle, setCollapsed, width, setWidth]
  );

  return <RightSidebarContext.Provider value={value}>{children}</RightSidebarContext.Provider>;
}

export function useRightSidebar() {
  const context = React.useContext(RightSidebarContext);
  if (!context) {
    throw new Error('useRightSidebar must be used within a RightSidebarProvider');
  }
  return context;
}
