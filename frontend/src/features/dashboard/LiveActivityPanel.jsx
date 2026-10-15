import { ArrowRightLeft, ShoppingCart } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { activityApi } from '../../api/endpoints.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { QueryState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useRealtimeEvent, useRealtimeStatus } from '../../realtime/realtime-context.js';
import { formatMoney, formatRelative } from '../../utils/format.js';
import { ORDER_STATUS_LABELS } from '../../utils/labels.js';

const SHOWN = 8;

const CONNECTION = {
  open: { dot: 'bg-status-good', label: 'Live' },
  connecting: { dot: 'bg-line-strong', label: 'Connecting…' },
  reconnecting: { dot: 'bg-status-warning', label: 'Reconnecting…' },
  unsupported: { dot: 'bg-line-strong', label: 'Not live' },
};

function ConnectionStatus() {
  const status = useRealtimeStatus();
  const { dot, label } = CONNECTION[status] ?? CONNECTION.connecting;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
      <span className="relative flex size-2">
        {status === 'open' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-good/60 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

function describe(item) {
  if (item.type === 'order.created') {
    return `${item.customerName ?? 'A customer'} placed an order`;
  }
  const status = ORDER_STATUS_LABELS[item.toStatus]?.toLowerCase() ?? item.toStatus;
  return item.toStatus === 'cancelled' ? 'Order cancelled' : `Order marked as ${status}`;
}

/** Re-renders periodically so "2 min ago" stays true. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Order placements and status changes as they happen: the latest events from the API, then new
 * ones pushed over the live stream (newest first).
 */
export function LiveActivityPanel({ refreshKey }) {
  const titleId = useId();
  const [reload, setReload] = useState(0);
  const [pushed, setPushed] = useState([]);
  const now = useNow();
  const query = useApiQuery(
    (signal) => activityApi.recent({ limit: SHOWN }, { signal }),
    [refreshKey, reload],
  );

  // Pushed events are kept whenever they arrive, even while the list is still loading (the
  // load may have read the database just before the event's order was committed).
  useRealtimeEvent('order', (event) => setPushed((current) => [event, ...current].slice(0, SHOWN)));
  useRealtimeEvent('resync', () => setReload((n) => n + 1));

  // Pushed and loaded events merged newest first; an event in both is shown once.
  const seen = new Set();
  const items = [...pushed, ...(query.data?.activity ?? [])]
    .filter((item) => !seen.has(item.eventId) && seen.add(item.eventId))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, SHOWN);

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader
        title="Live activity"
        titleId={titleId}
        description="Orders and status changes as they happen"
        actions={<ConnectionStatus />}
      />
      <div className="px-5 pt-3 pb-4">
        <QueryState
          query={query}
          height="h-48"
          isEmpty={() => items.length === 0}
          emptyMessage="New orders appear here as they are placed."
        >
          {() => (
            <ol
              aria-label="Recent order activity"
              aria-live="polite"
              className="divide-y divide-line"
            >
              {items.map((item) => {
                const Icon = item.type === 'order.created' ? ShoppingCart : ArrowRightLeft;
                return (
                  <li key={item.eventId} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken">
                      <Icon aria-hidden="true" className="size-3.5 text-ink-secondary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{describe(item)}</span>
                      <span className="block text-xs text-ink-muted">
                        <Link
                          to={`/orders/${item.orderId}`}
                          className="text-accent underline underline-offset-2"
                        >
                          {/* Underlined: it sits in a line of text, so color alone is not enough. */}
                          Order #{item.orderId}
                        </Link>{' '}
                        <time dateTime={item.occurredAt}>
                          {formatRelative(item.occurredAt, now)}
                        </time>
                      </span>
                    </span>
                    {item.type === 'order.created' && item.totalAmount && (
                      <span className="shrink-0 text-sm font-medium text-ink tabular">
                        {formatMoney(item.totalAmount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </QueryState>
      </div>
    </Card>
  );
}
