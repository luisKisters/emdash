import React, { createContext, useContext } from 'react';
import { cn } from '@renderer/utils/utils';

type SettingsSearchState = {
  query: string;
};

const EMPTY_STATE: SettingsSearchState = { query: '' };

const SettingsSearchContext = createContext<SettingsSearchState>(EMPTY_STATE);

export function SettingsSearchProvider({
  query,
  children,
}: {
  query: string;
  children: React.ReactNode;
}) {
  const value = query.trim() ? { query } : EMPTY_STATE;
  return <SettingsSearchContext.Provider value={value}>{children}</SettingsSearchContext.Provider>;
}

export function useSettingsSearch(): SettingsSearchState {
  return useContext(SettingsSearchContext);
}

/**
 * Marks a settings block with the id used by the search index. Search results
 * stay visually neutral; filtering the sidebar is enough to orient the user.
 */
export function SettingsSearchTarget({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-setting-id={id} className={cn(className)}>
      {children}
    </div>
  );
}
