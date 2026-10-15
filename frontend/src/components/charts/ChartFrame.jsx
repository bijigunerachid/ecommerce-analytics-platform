import { ChartColumn, Table2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { SegmentedControl } from '../ui/SegmentedControl.jsx';
import { useIsScrollable } from '../../hooks/useIsScrollable.js';

/**
 * A dashboard panel with a chart and an equivalent table. The table view makes every value
 * readable without hovering and without relying on color.
 */
export function ChartFrame({ title, description, chart, table, actions, className = '' }) {
  const [view, setView] = useState('chart');
  const titleId = useId();
  return (
    <Card className={`flex flex-col ${className}`} aria-labelledby={titleId}>
      <CardHeader
        title={title}
        titleId={titleId}
        description={description}
        actions={
          <>
            {actions}
            {table && (
              <SegmentedControl
                label={`${title}: view as`}
                value={view}
                onChange={setView}
                options={[
                  {
                    value: 'chart',
                    ariaLabel: 'Chart',
                    label: <ChartColumn aria-hidden="true" className="size-3.5" />,
                  },
                  {
                    value: 'table',
                    ariaLabel: 'Table',
                    label: <Table2 aria-hidden="true" className="size-3.5" />,
                  },
                ]}
              />
            )}
          </>
        }
      />
      <div className="min-w-0 flex-1 px-5 pt-3 pb-4">
        {view === 'table' && table ? table : chart}
      </div>
    </Card>
  );
}

/** Compact, accessible data table used by the table views. */
export function DataTable({ columns, rows, caption, maxHeight = 'max-h-72' }) {
  // While the table scrolls inside its box, the box can take keyboard focus so it can be
  // scrolled with the arrow keys; it is named after the table for screen readers.
  const [ref, scrollable] = useIsScrollable();
  return (
    <div
      ref={ref}
      className={`overflow-auto ${maxHeight}`}
      {...(scrollable && { tabIndex: 0, role: 'region', 'aria-label': caption })}
    >
      <table className="w-full text-left text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 bg-surface text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`border-b border-line py-2 pr-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink">
          {rows.map((row, i) => (
            <tr key={row.key ?? i} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-1.5 pr-3 ${c.align === 'right' ? 'text-right tabular' : ''}`}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
