import { createContext, useContext, useState, useLayoutEffect, useCallback, useMemo } from 'react';
import { themeStorage } from '../services/themeStorage';
import { getSchemeById, applyColorScheme } from '../colorSchemes';
import type { ColorScheme } from '../colorSchemes';

interface ThemeContextValue {
  schemeId: string;
  scheme: ColorScheme;
  setScheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [schemeId, setSchemeId] = useState<string>(() => themeStorage.get());

  const scheme = useMemo(() => getSchemeById(schemeId), [schemeId]);

  const setScheme = useCallback((id: string) => {
    setSchemeId(id);
    themeStorage.save(id);
  }, []);

  useLayoutEffect(() => {
    applyColorScheme(scheme);
  }, [scheme]);

  return (
    <ThemeContext.Provider value={{ schemeId, scheme, setScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
