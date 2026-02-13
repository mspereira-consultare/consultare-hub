"use client";

import React, { createContext, useContext, useMemo, useState } from 'react';

type HelpContextValue = {
  searchQuery: string;
  setSearchQuery: (next: string) => void;
};

const HelpContext = createContext<HelpContextValue | null>(null);

export const useHelpContext = () => {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelpContext must be used within <HelpProvider />');
  return ctx;
};

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const value = useMemo(() => ({ searchQuery, setSearchQuery }), [searchQuery]);

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}
