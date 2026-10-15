import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContext } from './toast-context.js';

const DURATION_MS = 5000;
const MAX_VISIBLE = 3;

const TOAST_STYLE = {
  success: { icon: CircleCheck, tone: 'text-status-good' },
  info: { icon: Info, tone: 'text-accent' },
  warning: { icon: TriangleAlert, tone: 'text-status-warning' },
  error: { icon: CircleX, tone: 'text-status-critical' },
};

/** One toast: dismisses itself after a while, but not while it is hovered or focused. */
function Toast({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(DURATION_MS);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast.id, onDismiss]);

  const { icon: Icon, tone } = TOAST_STYLE[toast.kind];
  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-ink shadow-pop"
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.message}</p>
        {toast.description && (
          <p className="mt-0.5 text-[13px] text-ink-secondary">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action.onClick();
              onDismiss(toast.id);
            }}
            className="mt-2 text-[13px] font-medium text-accent hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-mr-1 rounded-md p-0.5 text-ink-muted hover:bg-surface-hover hover:text-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Short-lived notifications for completed actions, announced politely to screen readers.
 * `toast.success(message, { description, action: { label, onClick } })`; also info, warning,
 * and error.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((kind, message, options = {}) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), { id, kind, message, ...options }]);
    return id;
  }, []);
  const value = useMemo(
    () => ({
      success: (m, o) => push('success', m, o),
      info: (m, o) => push('info', m, o),
      warning: (m, o) => push('warning', m, o),
      error: (m, o) => push('error', m, o),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
