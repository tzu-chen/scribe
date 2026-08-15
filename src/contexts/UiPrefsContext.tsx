import { createContext, useContext, useState, useCallback } from 'react';
import { uiPrefsStorage } from '../services/uiPrefsStorage';
import type { TocMode, UiPrefs } from '../types/uiPrefs';

interface UiPrefsContextValue {
  uiPrefs: UiPrefs;
  setTocMode: (mode: TocMode) => void;
}

const UiPrefsContext = createContext<UiPrefsContextValue | null>(null);

export function UiPrefsProvider({ children }: { children: React.ReactNode }) {
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => uiPrefsStorage.get());

  const setTocMode = useCallback((mode: TocMode) => {
    setUiPrefs(prev => {
      const next = { ...prev, tocMode: mode };
      uiPrefsStorage.save(next);
      return next;
    });
  }, []);

  return (
    <UiPrefsContext.Provider value={{ uiPrefs, setTocMode }}>
      {children}
    </UiPrefsContext.Provider>
  );
}

export function useUiPrefs(): UiPrefsContextValue {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) throw new Error('useUiPrefs must be used within a UiPrefsProvider');
  return ctx;
}
