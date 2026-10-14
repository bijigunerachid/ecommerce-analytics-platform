import { useId } from 'react';
import { analyticsApi } from '../../api/endpoints.js';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, QueryState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatDay, formatNumber, formatPercent } from '../../utils/format.js';

const WEEKS = 10;

/**
 * Sequential scale: one hue from light (low retention) to dark (high). The value is printed in
 * every cell, so the color is never the only way to read it. The first week (always 100%) is
 * left out, so it does not dominate the scale; the row shows the cohort size instead.
 *
 * Repeat rates are usually low, so the scale runs from 0 to the highest rate shown rather than
 * to 100%. The darkest step stays light enough for regular text in both themes.
 */
const MIN_WEIGHT = 8;
const MAX_WEIGHT = 60;

function cellStyle(rate, maxRate) {
  const t = maxRate > 0 ? rate / maxRate : 0;
  const weight = Math.round(MIN_WEIGHT + t * (MAX_WEIGHT - MIN_WEIGHT));
  return {
    backgroundColor: `color-mix(in oklab, var(--series-1) ${weight}%, var(--surface))`,
  };
}

/** Of the customers who first ordered in a week, the share who ordered again N weeks later. */
export function CohortsPanel() {
  const titleId = useId();
  const query = useApiQuery((signal) => analyticsApi.cohorts({ weeks: WEEKS }, { signal }), []);

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader
        title="Repeat purchases by first-order week"
        titleId={titleId}
        description="Each row is the customers whose first order was in that week (UTC, weeks start Monday). Columns show the share who ordered again 1, 2, 3… weeks later."
      />
      <div className="px-5 pt-4 pb-5">
        <QueryState
          query={query}
          height="h-48"
          isEmpty={(d) => d.cohorts.length === 0}
          empty={
            <EmptyState
              title="No cohorts yet"
              message="They appear after the insights job has run on orders."
              className="h-48"
            />
          }
        >
          {(data) => {
            const maxRate = Math.max(
              0,
              ...data.cohorts.flatMap((c) =>
                c.retention.filter((r) => r.weekOffset > 0).map((r) => r.rate),
              ),
            );
            return (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-xs">
                  <caption className="sr-only">Repeat purchases by first-order week</caption>
                  <thead className="text-ink-muted">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 text-left font-medium">
                        First order week
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        Customers
                      </th>
                      {Array.from({ length: data.weeks - 1 }, (_, i) => (
                        <th key={i} scope="col" className="px-2 py-1.5 text-center font-medium">
                          <span aria-hidden="true">+{i + 1}</span>
                          <span className="sr-only">{i + 1} weeks later</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((cohort) => {
                      const byOffset = new Map(cohort.retention.map((r) => [r.weekOffset, r]));
                      return (
                        <tr key={cohort.cohortWeek}>
                          <th
                            scope="row"
                            className="px-2 py-1.5 text-left font-medium whitespace-nowrap text-ink"
                          >
                            {formatDay(cohort.cohortWeek)}
                          </th>
                          <td className="px-2 py-1.5 text-right text-ink tabular">
                            {formatNumber(cohort.size)}
                          </td>
                          {Array.from({ length: data.weeks - 1 }, (_, i) => {
                            const cell = byOffset.get(i + 1);
                            if (!cell) {
                              return (
                                <td key={i} className="px-2 py-1.5 text-center text-ink-muted">
                                  <span aria-hidden="true">·</span>
                                  <span className="sr-only">not yet</span>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={i}
                                style={cellStyle(cell.rate, maxRate)}
                                title={`${formatNumber(cell.active)} of ${formatNumber(cohort.size)} customers`}
                                className="rounded-sm px-2 py-1.5 text-center font-medium text-ink tabular"
                              >
                                {formatPercent(cell.rate)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }}
        </QueryState>
      </div>
    </Card>
  );
}
