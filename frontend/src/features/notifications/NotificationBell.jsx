import { Bell, CircleAlert, PackageX, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { notificationsApi } from '../../api/endpoints.js';
import { useToast } from '../../components/ui/toast-context.js';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useRealtimeEvent } from '../../realtime/realtime-context.js';
import { formatRelative } from '../../utils/format.js';

const KIND_ICON = { low_stock: TriangleAlert, out_of_stock: PackageX, anomaly: CircleAlert };
const SEVERITY_TONE = {
  critical: 'text-status-critical',
  warning: 'text-status-warning',
  info: 'text-ink-muted',
};

/**
 * Top-bar notifications: low or out-of-stock products and detected anomalies. New ones arrive
 * over the live stream; critical ones also show a toast. Opening the panel does not mark
 * anything as read: "Mark all as read" does.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const toast = useToast();
  const panelId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const query = useApiQuery((signal) => notificationsApi.list({ limit: 15 }, { signal }), [reload]);

  useRealtimeEvent('notification', (event) => {
    setReload((n) => n + 1);
    if (event.severity === 'critical') toast.error(event.title);
  });
  useRealtimeEvent('resync', () => setReload((n) => n + 1));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function markAllRead() {
    await notificationsApi.markAllRead();
    setReload((n) => n + 1);
  }

  const unread = query.data?.unreadCount ?? 0;
  const items = query.data?.notifications ?? [];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-sunken hover:text-ink"
      >
        <Bell aria-hidden="true" className="size-4.5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-critical px-1 text-[10px] font-semibold text-white tabular"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="animate-pop-in absolute top-full right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface-raised shadow-pop"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-accent hover:underline"
              >
                Mark all as read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">
              Nothing yet. Low stock and detected anomalies appear here.
            </p>
          ) : (
            <ul className="max-h-[min(70vh,28rem)] divide-y divide-line overflow-y-auto">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? CircleAlert;
                return (
                  <li key={n.id}>
                    <Link
                      to={n.link ?? '/'}
                      onClick={() => setOpen(false)}
                      className={`flex gap-3 px-4 py-3 hover:bg-surface-sunken ${n.unread ? 'bg-accent-soft/20 dark:bg-accent-soft/25' : ''}`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`mt-0.5 size-4 shrink-0 ${SEVERITY_TONE[n.severity]}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">
                          {n.title}
                          {n.unread && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-secondary">{n.body}</span>
                        <span className="mt-1 block text-[11px] text-ink-muted">
                          <time dateTime={n.createdAt}>{formatRelative(n.createdAt)}</time>
                        </span>
                      </span>
                      {n.unread && (
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
