import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/** @returns {{ success, info, warning, error: (message: string, options?: { description?: string, action?: { label: string, onClick: () => void } }) => number, dismiss: (id: number) => void }} */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
