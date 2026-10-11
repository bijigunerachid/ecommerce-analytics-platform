import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/** @returns {{ success: (message: string) => void, error: (message: string) => void }} */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
