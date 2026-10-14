/** A shimmering placeholder block; size it with classes (e.g. "h-4 w-24"). */
export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/** Placeholder rows for a table that is loading for the first time. */
export function TableSkeleton({ rows = 8, columns = 5, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              className={`h-3.5 ${c === 0 ? 'w-14' : c === 1 ? 'flex-1' : 'w-20'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
