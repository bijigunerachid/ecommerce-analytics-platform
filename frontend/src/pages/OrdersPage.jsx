import { Plus, ReceiptText, X } from 'lucide-react';
import { useState } from 'react';
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
import { Button } from '../components/ui/Button.jsx';
import { FILTER_DATE_INPUT, buttonClass } from '../components/ui/button-styles.js';
import { FilterTabs } from '../components/ui/FilterTabs.jsx';
import { ExportMenu } from '../components/data/ExportMenu.jsx';
import { Card } from '../components/ui/Card.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { BulkStatusDialog } from '../features/orders/BulkStatusDialog.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format.js';
import { ORDER_ACTION_LABELS, ORDER_STATUS_LABELS } from '../utils/labels.js';

const BULK_STATUSES = ['paid', 'shipped', 'delivered', 'cancelled'];

/** Bar shown above the table while orders are selected. */
function SelectionBar({ count, onAction, onClear }) {
  return (
    <div
      role="region"
      aria-label="Selected orders"
      className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/30 px-4 py-2.5 dark:bg-accent-soft/40"
    >
      <p className="mr-2 text-sm font-medium text-ink">{count} selected</p>
      {BULK_STATUSES.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={status === 'cancelled' ? 'ghost' : 'secondary'}
          onClick={() => onAction(status)}
        >
          {status === 'cancelled' ? 'Cancel orders' : ORDER_ACTION_LABELS[status]}
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        Clear selection
      </Button>
    </div>
  );
}

const DATE_INPUT = FILTER_DATE_INPUT;

const STATUS_TABS = [
  { value: '', label: 'All' },
  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

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
  const toast = useToast();
  // The selection belongs to the rows on screen: changing the page or a filter clears it.
  const listKey = JSON.stringify(params);
  const [selection, setSelection] = useState({ key: listKey, ids: [] });
  const selected = selection.key === listKey ? selection.ids : [];
  const select = (ids) => setSelection({ key: listKey, ids });
  const [bulkStatus, setBulkStatus] = useState(null);

  function bulkDone({ status, updated }) {
    if (updated.length > 0) {
      const what = `${updated.length} order${updated.length === 1 ? '' : 's'}`;
      toast.success(
        status === 'cancelled'
          ? `Cancelled ${what}.`
          : `Marked ${what} as ${ORDER_STATUS_LABELS[status].toLowerCase()}.`,
      );
    }
    select([]);
    query.refetch();
  }

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
        icon={ReceiptText}
        description="Totals are calculated by the server from current prices."
        actions={
          <>
            <ExportMenu name="orders" params={cleanParams(params)} />
            {canEdit && (
              <Link to="/orders/new" className={buttonClass()}>
                <Plus aria-hidden="true" className="size-4" /> New order
              </Link>
            )}
          </>
        }
      />
      <Card>
        <div className="border-b border-line px-2 sm:px-3">
          <FilterTabs
            label="Status"
            value={params.status}
            onChange={(status) => update({ status })}
            options={STATUS_TABS}
          />
        </div>
        <FilterBar
          activeCount={
            [params.search, params.dateFrom, params.dateTo, params.customerId].filter(Boolean)
              .length
          }
          onClear={() => update({ search: '', dateFrom: '', dateTo: '', customerId: '' })}
        >
          <SearchInput
            label="Search orders"
            placeholder="Customer, email, or order #"
            value={params.search}
            onChange={(search) => update({ search })}
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-soft px-2.5 text-[13px] font-medium text-ink"
            >
              Customer #{params.customerId}
              <X aria-label="Clear customer filter" className="size-3.5" />
            </button>
          )}
        </FilterBar>
        {selected.length > 0 && (
          <SelectionBar
            count={selected.length}
            onAction={setBulkStatus}
            onClear={() => select([])}
          />
        )}
        <ResourceTable
          caption="Orders"
          selection={
            canEdit
              ? {
                  selected,
                  onChange: select,
                  rowLabel: (o) => `Select order #${o.id}`,
                  allLabel: 'Select all orders on this page',
                }
              : undefined
          }
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
      {bulkStatus && (
        <BulkStatusDialog
          status={bulkStatus}
          orderIds={selected}
          onClose={() => setBulkStatus(null)}
          onDone={bulkDone}
        />
      )}
    </div>
  );
}
