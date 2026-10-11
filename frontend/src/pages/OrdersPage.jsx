import { Plus, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ordersApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import {
  FilterBar,
  PageHeader,
  ResourceTable,
  SearchInput,
} from '../components/data/ResourceTable.jsx';
import { OrderStatusBadge } from '../components/ui/Badge.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FilterSelect } from '../components/ui/Field.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format.js';
import { ORDER_STATUS_LABELS } from '../utils/labels.js';

const DATE_INPUT =
  'h-9 rounded-lg border border-line-strong bg-surface-raised px-2 text-sm text-ink';

export function OrdersPage() {
  const { canEdit } = usePermissions();
  const navigate = useNavigate();
  const { params, update, toggleSort } = useListParams({
    search: '',
    status: '',
    customerId: '',
    dateFrom: '',
    dateTo: '',
    sort: 'createdAt',
    order: 'desc',
  });

  const query = useApiQuery(
    (signal) => ordersApi.list(cleanParams({ ...params, pageSize: 20 }), { signal }),
    [params],
  );

  const columns = [
    {
      key: 'id',
      label: 'Order',
      render: (o) => (
        <Link
          to={`/orders/${o.id}`}
          className="font-medium text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          #{o.id}
        </Link>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (o) => (
        <div>
          <p>{o.customerName}</p>
          <p className="text-xs text-ink-muted">{o.customerEmail}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortKey: 'status',
      render: (o) => <OrderStatusBadge status={o.status} />,
    },
    { key: 'itemCount', label: 'Lines', align: 'right', render: (o) => formatNumber(o.itemCount) },
    {
      key: 'totalAmount',
      label: 'Total',
      sortKey: 'totalAmount',
      align: 'right',
      defaultOrder: 'desc',
      render: (o) => formatMoney(o.totalAmount),
    },
    {
      key: 'createdAt',
      label: 'Placed',
      sortKey: 'createdAt',
      defaultOrder: 'desc',
      render: (o) => formatDateTime(o.createdAt),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description="Totals are calculated by the server from current prices."
        actions={
          canEdit && (
            <Link
              to="/orders/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong"
            >
              <Plus aria-hidden="true" className="size-4" /> New order
            </Link>
          )
        }
      />
      <Card>
        <FilterBar>
          <SearchInput
            label="Search orders"
            placeholder="Customer, email, or order #"
            value={params.search}
            onChange={(search) => update({ search })}
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(e) => update({ status: e.target.value })}
            options={[
              { value: '', label: 'Any status' },
              ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="orders-from">
              Placed from
            </label>
            <input
              id="orders-from"
              type="date"
              className={DATE_INPUT}
              value={params.dateFrom}
              max={params.dateTo || undefined}
              onChange={(e) => update({ dateFrom: e.target.value })}
            />
            <span aria-hidden="true" className="text-ink-muted">
              –
            </span>
            <label className="sr-only" htmlFor="orders-to">
              Placed until
            </label>
            <input
              id="orders-to"
              type="date"
              className={DATE_INPUT}
              value={params.dateTo}
              min={params.dateFrom || undefined}
              onChange={(e) => update({ dateTo: e.target.value })}
            />
          </div>
          {params.customerId && (
            <button
              type="button"
              onClick={() => update({ customerId: '' })}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft/60 px-3 text-xs font-medium text-ink dark:bg-accent-soft"
            >
              Customer #{params.customerId}
              <X aria-label="Clear customer filter" className="size-3.5" />
            </button>
          )}
        </FilterBar>
        <ResourceTable
          caption="Orders"
          query={query}
          columns={columns}
          rowKey={(o) => o.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
          onRowClick={(o) => navigate(`/orders/${o.id}`)}
        />
      </Card>
    </div>
  );
}
