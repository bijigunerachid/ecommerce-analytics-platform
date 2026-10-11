import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatNumber } from '../../utils/format.js';
import { Button } from '../ui/Button.jsx';
import { QueryState } from '../ui/States.jsx';

/** Search box that updates the list after typing pauses. */
export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search' }) {
  const [text, setText] = useState(value ?? '');
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
        className="h-9 w-full rounded-lg border border-line-strong bg-surface-raised pr-3 pl-8 text-sm text-ink placeholder:text-ink-muted"
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

/**
 * Server-driven table: sortable headers (aria-sort), pagination, and query states. On small
 * screens the table scrolls horizontally inside its card instead of breaking the page layout.
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
}) {
  return (
    <QueryState query={query} isEmpty={(d) => d.data.length === 0} empty={empty} height="h-64">
      {(result) => (
        <div aria-busy={query.isFetching}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="border-b border-line text-xs text-ink-muted">
                <tr>
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
                    className={onRowClick ? 'cursor-pointer hover:bg-surface-sunken' : ''}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2.5 align-middle text-ink ${c.align === 'right' ? 'text-right tabular' : ''} ${c.className ?? ''}`}
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
      className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-ink-secondary"
    >
      <p>
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
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
        <span className="px-1">
          Page {page} of {Math.max(totalPages, 1)}
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
export function PageHeader({ title, description, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="text-sm text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Row of filters above a table: search on the left, selects after it. */
export function FilterBar({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">{children}</div>
  );
}
