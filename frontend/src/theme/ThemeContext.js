import { createContext, useContext } from 'react';

export const THEMES = ['light', 'dark', 'system'];
export const ThemeContext = createContext(null);

/** @returns {{ theme: 'light'|'dark'|'system', resolved: 'light'|'dark', setTheme: Function }} */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
