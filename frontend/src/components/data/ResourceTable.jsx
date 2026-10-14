import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatNumber } from '../../utils/format.js';
import { pageWindow } from '../../utils/pagination.js';
import { Button } from '../ui/Button.jsx';
import { TableSkeleton } from '../ui/Skeleton.jsx';
import { QueryState } from '../ui/States.jsx';

/** Search box that updates the list after typing pauses. */
export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }) {
  const [text, setText] = useState(value ?? '');
  // Follow outside changes to the value (e.g. the command palette navigating with ?search=).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value ?? '');
  }
  const debounced = useDebouncedValue(text, 300);
  useEffect(() => {
    if (debounced !== (value ?? '')) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-ink-muted"
      />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface-raised pr-3 pl-8 text-sm text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
      />
    </div>
  );
}

function SortHeader({ column, sort, order, onSort }) {
  const active = sort === column.sortKey;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column.sortKey, column.defaultOrder)}
      className={`inline-flex items-center gap-1 font-medium hover:text-ink ${active ? 'text-ink' : ''}`}
    >
      {column.label}
      <Icon aria-hidden="true" className={`size-3.5 ${active ? '' : 'opacity-40'}`} />
    </button>
  );
}

/** Header checkbox: selects or clears every row on the current page (mixed when some are). */
function SelectAllCheckbox({ rows, rowKey, selection }) {
  const keys = rows.map(rowKey);
  const count = keys.filter((k) => selection.selected.includes(k)).length;
  return (
    <input
      type="checkbox"
      aria-label={selection.allLabel}
      checked={count > 0 && count === keys.length}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && count < keys.length;
      }}
      onChange={(e) =>
        selection.onChange(
          e.target.checked
            ? [...new Set([...selection.selected, ...keys])]
            : selection.selected.filter((k) => !keys.includes(k)),
        )
      }
      className="size-4 rounded border-line-strong accent-[var(--accent)]"
    />
  );
}

/**
 * Server-driven table: sortable headers (aria-sort), pagination, and query states. On small
 * screens the table scrolls horizontally inside its card instead of breaking the page layout.
 * Optional `selection` ({ selected, onChange, rowLabel, allLabel }) adds row checkboxes.
 */
export function ResourceTable({
  query,
  columns,
  rowKey,
  sort,
  order,
  onSort,
  onPageChange,
  caption,
  empty,
  onRowClick,
  selection,
}) {
  if (query.isLoading) {
    return <TableSkeleton columns={Math.min(columns.length, 6)} label={`Loading ${caption}`} />;
  }
  return (
    <QueryState query={query} isEmpty={(d) => d.data.length === 0} empty={empty} height="h-64">
      {(result) => (
        <div aria-busy={query.isFetching}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="border-b border-line bg-surface-sunken/50 text-xs text-ink-muted">
                <tr>
                  {selection && (
                    <th scope="col" className="w-10 py-2.5 pr-0 pl-4">
                      <SelectAllCheckbox rows={result.data} rowKey={rowKey} selection={selection} />
                    </th>
                  )}
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        c.sortKey && sort === c.sortKey
                          ? order === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className={`px-4 py-2.5 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {c.sortKey ? (
                        <SortHeader column={c} sort={sort} order={order} onSort={onSort} />
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-line ${query.isFetching ? 'opacity-60' : ''}`}>
                {result.data.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={`transition-colors hover:bg-surface-sunken/60 ${onRowClick ? 'cursor-pointer' : ''} ${
                      selection?.selected.includes(rowKey(row))
                        ? 'bg-accent-soft/25 dark:bg-accent-soft/30'
                        : ''
                    }`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selection && (
                      <td className="w-10 py-3 pr-0 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={selection.rowLabel(row)}
                          checked={selection.selected.includes(rowKey(row))}
                          onChange={(e) =>
                            selection.onChange(
                              e.target.checked
                                ? [...selection.selected, rowKey(row)]
                                : selection.selected.filter((k) => k !== rowKey(row)),
                            )
                          }
                          className="size-4 rounded border-line-strong accent-[var(--accent)]"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 align-middle text-ink ${c.align === 'right' ? 'text-right tabular' : ''} ${c.className ?? ''}`}
                      >
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={result.pagination} onPageChange={onPageChange} />
        </div>
      )}
    </QueryState>
  );
}

export function Pagination({ pagination, onPageChange }) {
  const { page, pageSize, total, totalPages } = pagination;
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-ink-secondary"
    >
      <p>
        Showing{' '}
        <span className="font-medium text-ink">
          {formatNumber(first)}–{formatNumber(last)}
        </span>{' '}
        of <span className="font-medium text-ink">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden="true" className="size-4" /> Previous
        </Button>
        <span className="px-1 sm:hidden">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`h-8 min-w-8 rounded-lg px-2 text-xs font-medium tabular ${
                  p === page
                    ? 'bg-accent text-on-accent shadow-card'
                    : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                {p}
              </button>
            ),
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Page header with title, description, and primary actions. */
export function PageHeader({ title, description, actions, icon: Icon }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised shadow-card sm:flex">
            <Icon aria-hidden="true" className="size-5 text-accent" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-ink-secondary">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Row of filters above a table: search on the left, selects after it. */
export function FilterBar({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
      {children}
    </div>
  );
}
