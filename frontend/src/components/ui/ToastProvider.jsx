import { CircleCheck, CircleX, TriangleAlert, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from './toast-context.js';

const DURATION_MS = 5000;

const TOAST_STYLE = {
  success: { icon: CircleCheck, tone: 'text-status-good' },
  warning: { icon: TriangleAlert, tone: 'text-status-warning' },
  error: { icon: CircleX, tone: 'text-status-critical' },
};

/** Short-lived notifications for completed actions. Announced politely to screen readers. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind, message) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );
  const value = useMemo(
    () => ({
      success: (m) => push('success', m),
      warning: (m) => push('warning', m),
      error: (m) => push('error', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { icon: Icon, tone } = TOAST_STYLE[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className="animate-pop-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink shadow-pop"
            >
              <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone}`} />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="text-ink-muted hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
