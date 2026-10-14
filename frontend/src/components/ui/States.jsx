import { CircleAlert, Inbox, RotateCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { Skeleton } from './Skeleton.jsx';

/** Placeholder with the panel's final height, so layout doesn't jump when data arrives. */
export function LoadingState({ label = 'Loading', className = 'h-64' }) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col gap-3 p-5 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="w-full flex-1 rounded-lg" />
    </div>
  );
}

export function EmptyState({
  title = 'No data yet',
  message,
  icon: Icon = Inbox,
  action,
  className = 'h-64',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${className}`}
    >
      <span className="mb-1 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-raised shadow-card">
        <Icon aria-hidden="true" className="size-5 text-ink-muted" />
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="max-w-sm text-xs text-ink-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = 'h-64' }) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${className}`}
    >
      <span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-status-critical/10">
        <CircleAlert aria-hidden="true" className="size-5 text-status-critical" />
      </span>
      <p className="text-sm font-medium text-ink">Couldn&apos;t load this data</p>
      <p className="max-w-sm text-xs text-ink-muted">{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw aria-hidden="true" className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Renders the right state for a query: loading (first load only), error, empty, or content.
 * During a refetch the previous content stays visible.
 */
export function QueryState({ query, isEmpty, empty, emptyMessage, height = 'h-64', children }) {
  if (query.isLoading) return <LoadingState className={height} />;
  if (query.error && query.data === undefined) {
    return <ErrorState error={query.error} onRetry={query.refetch} className={height} />;
  }
  if (isEmpty?.(query.data)) {
    return empty ?? <EmptyState message={emptyMessage} className={height} />;
  }
  return children(query.data);
}
