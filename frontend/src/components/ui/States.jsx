import { CircleAlert, Inbox, RotateCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { Spinner } from './Spinner.jsx';

/** Placeholder with the panel's final height, so layout doesn't jump when data arrives. */
export function LoadingState({ label = 'Loading', className = 'h-64' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ title = 'No data yet', message, className = 'h-64' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 px-6 text-center ${className}`}
    >
      <Inbox aria-hidden="true" className="size-6 text-ink-muted" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="max-w-sm text-xs text-ink-muted">{message}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = 'h-64' }) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${className}`}
    >
      <CircleAlert aria-hidden="true" className="size-6 text-status-critical" />
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
