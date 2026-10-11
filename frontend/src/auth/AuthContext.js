import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** @returns {{ user: object|null, status: 'loading'|'authenticated'|'anonymous',
 *   login: (email: string, password: string) => Promise<object>, logout: () => Promise<void> }} */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
