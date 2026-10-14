import { useId, useState } from 'react';
import { Link } from 'react-router';
import { analyticsApi } from '../../api/endpoints.js';
import { BarList } from '../../components/charts/BarList.jsx';
import { DataTable } from '../../components/charts/ChartFrame.jsx';
import { Pagination } from '../../components/data/ResourceTable.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { EmptyState, QueryState } from '../../components/ui/States.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatDay, formatMoney, formatNumber, formatPercent } from '../../utils/format.js';
import { SEGMENT_INFO } from './segments.js';

function SegmentCustomers({ segment, onClose }) {
  const [page, setPage] = useState(1);
  const query = useApiQuery(
    (signal) => analyticsApi.segmentCustomers(segment, { page, pageSize: 10 }, { signal }),
    [segment, page],
  );
  const info = SEGMENT_INFO[segment];
  return (
    <Modal open title={info.label} description={info.description} onClose={onClose} size="lg">
      <QueryState query={query} height="h-48" isEmpty={(d) => d.data.length === 0}>
        {(data) => (
          <>
            <DataTable
              caption={`${info.label} customers`}
              maxHeight=""
              columns={[
                {
                  key: 'name',
                  label: 'Customer',
                  render: (c) => (
                    <Link
                      to={`/customers/${c.customerId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {c.name ?? `Customer #${c.customerId}`}
                    </Link>
                  ),
                },
                {
                  key: 'monetary',
                  label: 'Spent',
                  align: 'right',
                  render: (c) => formatMoney(c.monetary),
                },
                {
                  key: 'frequency',
                  label: 'Orders',
                  align: 'right',
                  render: (c) => formatNumber(c.frequency),
                },
                {
                  key: 'recencyDays',
                  label: 'Last order',
                  align: 'right',
                  render: (c) => `${formatNumber(c.recencyDays)} d ago`,
                },
                {
                  key: 'scores',
                  label: 'R / F / M',
                  align: 'right',
                  render: (c) => `${c.scores.r} / ${c.scores.f} / ${c.scores.m}`,
                },
              ]}
              rows={data.data.map((c) => ({ ...c, key: c.customerId }))}
            />
            <Pagination pagination={data.pagination} onPageChange={setPage} />
          </>
        )}
      </QueryState>
    </Modal>
  );
}

/** Customers by value segment, with how much of the revenue each segment brings. */
export function SegmentsPanel({ data }) {
  const titleId = useId();
  const [open, setOpen] = useState(null);
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader
        title="Customer segments"
        titleId={titleId}
        description="By recency, frequency, and spend (RFM), cancelled orders excluded. Select a segment to see its customers."
      />
      <div className="px-5 pt-4 pb-5">
        {data.totalCustomers === 0 ? (
          <EmptyState
            title="No segments yet"
            message="Segments appear after the insights job has run on orders."
            className="h-48"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <BarList
              label="Customers per segment"
              items={data.segments.map((s) => ({
                key: s.segment,
                label: SEGMENT_INFO[s.segment].label,
                value: s.customers,
                share: s.customerShare,
              }))}
              formatValue={(v) => formatNumber(v)}
              formatSecondary={(item) => formatPercent(item.share)}
            />
            <DataTable
              caption="Segments"
              maxHeight=""
              columns={[
                {
                  key: 'segment',
                  label: 'Segment',
                  render: (s) => (
                    <button
                      type="button"
                      onClick={() => setOpen(s.segment)}
                      disabled={s.customers === 0}
                      className="text-left font-medium text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
                    >
                      {SEGMENT_INFO[s.segment].label}
                      <span className="block text-[11px] font-normal text-ink-muted">
                        {SEGMENT_INFO[s.segment].description}
                      </span>
                    </button>
                  ),
                },
                {
                  key: 'revenueShare',
                  label: 'Revenue',
                  align: 'right',
                  render: (s) => (
                    <>
                      {formatMoney(s.revenue, { compact: true })}
                      <span className="block text-[11px] text-ink-muted">
                        {formatPercent(s.revenueShare)}
                      </span>
                    </>
                  ),
                },
                {
                  key: 'avgOrders',
                  label: 'Avg. orders',
                  align: 'right',
                  render: (s) => (s.avgOrders === null ? '—' : s.avgOrders.toFixed(1)),
                },
                {
                  key: 'avgRecencyDays',
                  label: 'Avg. days since order',
                  align: 'right',
                  render: (s) =>
                    s.avgRecencyDays === null ? '—' : formatNumber(Math.round(s.avgRecencyDays)),
                },
              ]}
              rows={data.segments.map((s) => ({ ...s, key: s.segment }))}
            />
          </div>
        )}
        {data.run.asOf && (
          <p className="mt-4 text-xs text-ink-muted">
            Recency counted up to {formatDay(data.run.asOf)}.
          </p>
        )}
      </div>
      {open && <SegmentCustomers segment={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
