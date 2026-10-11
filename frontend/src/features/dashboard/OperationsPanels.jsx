import { useId } from 'react';
import { analyticsApi, pipelineApi } from '../../api/endpoints.js';
import { DataTable } from '../../components/charts/ChartFrame.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { QueryState } from '../../components/ui/States.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { formatDateTime, formatDay, formatNumber, formatRelative } from '../../utils/format.js';

function Panel({ title, description, children, className = '' }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} className={`flex flex-col ${className}`}>
      <CardHeader title={title} titleId={id} description={description} />
      <div className="min-w-0 flex-1 px-5 pt-3 pb-4">{children}</div>
    </Card>
  );
}

function stockStatus(p) {
  if (p.isOutOfStock) return <StatusBadge status="critical" label="Out of stock" />;
  if (p.isLowStock) return <StatusBadge status="warning" label="Low stock" />;
  return <StatusBadge status="good" label="OK" />;
}

export function InventoryPanel({ range, refreshKey }) {
  const query = useApiQuery(
    (signal) => analyticsApi.inventory({ from: range.from, to: range.to, limit: 8 }, { signal }),
    [range.from, range.to, refreshKey],
  );
  return (
    <Panel
      title="Inventory watchlist"
      description="Most urgent first: least stock relative to sales"
    >
      <QueryState query={query} isEmpty={(d) => d.products.length === 0} height="h-64">
        {(data) => (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {data.summary.outOfStockProducts > 0 && (
                <StatusBadge
                  status="critical"
                  label={`${data.summary.outOfStockProducts} out of stock`}
                />
              )}
              {data.summary.lowStockProducts > 0 && (
                <StatusBadge
                  status="warning"
                  label={`${data.summary.lowStockProducts} low stock`}
                />
              )}
              {data.summary.outOfStockProducts + data.summary.lowStockProducts === 0 && (
                <StatusBadge status="good" label="All products well stocked" />
              )}
              <span className="self-center text-ink-muted">
                {formatNumber(data.summary.unitsOut)} units out ·{' '}
                {formatNumber(data.summary.unitsIn)} in
              </span>
            </div>
            <DataTable
              caption="Inventory watchlist"
              maxHeight=""
              columns={[
                {
                  key: 'name',
                  label: 'Product',
                  render: (p) => <span className="line-clamp-2">{p.name}</span>,
                },
                {
                  key: 'stock',
                  label: 'Stock',
                  align: 'right',
                  render: (p) => formatNumber(p.stock),
                },
                {
                  key: 'daysOfCover',
                  label: 'Cover (days)',
                  align: 'right',
                  render: (p) => (p.daysOfCover === null ? '—' : p.daysOfCover.toFixed(1)),
                },
                { key: 'status', label: 'Status', render: stockStatus },
              ]}
              rows={data.products.map((p) => ({ ...p, key: p.productId }))}
            />
          </div>
        )}
      </QueryState>
    </Panel>
  );
}

const COMPONENT_LABELS = { 'outbox-relay': 'Outbox relay', 'spark-streaming': 'Spark streaming' };
const COMPONENT_STATUS = {
  up: ['good', 'Running'],
  degraded: ['warning', 'Degraded'],
  down: ['critical', 'Down'],
  unknown: ['unknown', 'Not started'],
};
const OVERALL_STATUS = {
  healthy: ['good', 'Healthy'],
  degraded: ['warning', 'Degraded'],
  unhealthy: ['critical', 'Unhealthy'],
};

export function PipelinePanel({ refreshKey }) {
  const query = useApiQuery((signal) => pipelineApi.health({ signal }), [refreshKey]);
  return (
    <Panel title="Data pipeline health" description="Event publishing and stream processing">
      <QueryState query={query} height="h-48">
        {(data) => {
          const [overall, overallLabel] = OVERALL_STATUS[data.status] ?? ['unknown', data.status];
          const spark = data.components.find((c) => c.component === 'spark-streaming');
          return (
            <div className="space-y-4 text-sm">
              <StatusBadge status={overall} label={overallLabel} />
              <ul className="divide-y divide-line">
                {data.components.map((c) => {
                  const [status, label] = COMPONENT_STATUS[c.status] ?? COMPONENT_STATUS.unknown;
                  return (
                    <li key={c.component} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {COMPONENT_LABELS[c.component] ?? c.component}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Last heartbeat {formatRelative(c.lastSeenAt)}
                          {c.details?.lastError ? ` · ${c.details.lastError}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={status} label={label} />
                    </li>
                  );
                })}
              </ul>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Metric label="Waiting to publish" value={formatNumber(data.outbox.pending)} />
                <Metric
                  label="Oldest waiting"
                  value={
                    data.outbox.oldestPendingAgeSeconds === null
                      ? '—'
                      : `${data.outbox.oldestPendingAgeSeconds} s`
                  }
                />
                <Metric
                  label="Published, last hour"
                  value={formatNumber(data.outbox.publishedLastHour)}
                />
                <Metric
                  label="Kafka lag"
                  value={
                    spark?.details?.kafkaLag === undefined || spark?.details?.kafkaLag === null
                      ? '—'
                      : formatNumber(spark.details.kafkaLag)
                  }
                />
              </dl>
              {data.outbox.lastError && (
                <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
                  Last publishing error: {data.outbox.lastError}
                </p>
              )}
            </div>
          );
        }}
      </QueryState>
    </Panel>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink tabular">{value}</dd>
    </div>
  );
}

const SEVERITY = {
  high: ['critical', 'High'],
  medium: ['serious', 'Medium'],
  low: ['warning', 'Low'],
};
const ANOMALY_LABELS = {
  high_value_order: 'Unusually large order',
  order_velocity: 'Burst of orders',
  revenue_spike: 'Revenue spike',
  large_stock_reduction: 'Large stock write-off',
};

function describeEntity(a) {
  if (a.entityType === 'day') return `Day of ${formatDay(a.entityId)}`;
  const noun = { order: 'Order', customer: 'Customer', product: 'Product' }[a.entityType];
  return `${noun ?? a.entityType} #${a.entityId} · ${formatDateTime(a.occurredAt)}`;
}

export function AnomaliesPanel({ range, refreshKey }) {
  const query = useApiQuery(
    (signal) => analyticsApi.anomalies({ from: range.from, to: range.to, pageSize: 6 }, { signal }),
    [range.from, range.to, refreshKey],
  );
  return (
    <Panel
      title="Detected anomalies"
      description="Suspicious patterns flagged by the stream processor"
    >
      <QueryState
        query={query}
        isEmpty={(d) => d.data.length === 0}
        height="h-48"
        empty={
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <StatusBadge status="good" label="No anomalies in this period" />
          </div>
        }
      >
        {(data) => (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              {formatNumber(data.summary.total)} in this period
              {data.summary.total > data.data.length ? `, latest ${data.data.length} shown` : ''}
            </p>
            <ul className="divide-y divide-line">
              {data.data.map((a) => {
                const [status, label] = SEVERITY[a.severity] ?? ['unknown', a.severity];
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {ANOMALY_LABELS[a.type] ?? a.type}
                      </p>
                      <p className="text-xs text-ink-secondary">{a.description}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{describeEntity(a)}</p>
                    </div>
                    <StatusBadge status={status} label={label} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </QueryState>
    </Panel>
  );
}
