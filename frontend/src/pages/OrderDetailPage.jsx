import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ordersApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import { DataTable } from '../components/charts/ChartFrame.jsx';
import { OrderStatusBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { buttonClass } from '../components/ui/button-styles.js';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { OrderActivity } from '../features/orders/OrderActivity.jsx';
import { OrderProgress } from '../features/orders/OrderProgress.jsx';
import { StatusChangeDialog } from '../features/orders/StatusChangeDialog.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format.js';
import { ORDER_ACTION_LABELS, ORDER_STATUS_LABELS, ORDER_TRANSITIONS } from '../utils/labels.js';

function ItemsCard({ order }) {
  return (
    <Card>
      <CardHeader title="Items" description="Prices were fixed when the order was placed." />
      <div className="px-5 pt-3 pb-5">
        <DataTable
          caption={`Items of order ${order.id}`}
          maxHeight=""
          columns={[
            {
              key: 'product',
              label: 'Product',
              render: (i) => (
                <div>
                  <p className="text-sm text-ink">{i.productName}</p>
                  <p className="font-mono text-xs text-ink-muted">{i.sku}</p>
                </div>
              ),
            },
            {
              key: 'quantity',
              label: 'Qty',
              align: 'right',
              render: (i) => formatNumber(i.quantity),
            },
            {
              key: 'unitPrice',
              label: 'Unit price',
              align: 'right',
              render: (i) => formatMoney(i.unitPrice),
            },
            {
              key: 'lineTotal',
              label: 'Line total',
              align: 'right',
              render: (i) => formatMoney(i.lineTotal),
            },
          ]}
          rows={order.items.map((i) => ({ ...i, key: i.productId }))}
        />
        <dl className="mt-3 flex items-baseline justify-end gap-6 border-t border-line pt-4">
          <dt className="text-sm text-ink-secondary">Total</dt>
          <dd className="text-xl font-semibold tracking-tight text-ink tabular">
            {formatMoney(order.totalAmount)}
          </dd>
        </dl>
      </div>
    </Card>
  );
}

function CustomerCard({ order }) {
  return (
    <Card>
      <CardHeader title="Customer" />
      <div className="space-y-1 px-5 pt-3 pb-5 text-sm">
        <p className="font-medium text-ink">{order.customerName}</p>
        <a href={`mailto:${order.customerEmail}`} className="text-ink-secondary hover:text-ink">
          {order.customerEmail}
        </a>
        <p className="pt-2">
          <Link
            to={`/orders?customerId=${order.customerId}`}
            className="text-sm font-medium text-accent hover:underline"
          >
            All orders from this customer
          </Link>
        </p>
      </div>
    </Card>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { canEdit } = usePermissions();
  const toast = useToast();
  const [pending, setPending] = useState(null); // target status awaiting confirmation
  const query = useApiQuery((signal) => ordersApi.get(id, { signal }), [id]);
  const historyQuery = useApiQuery((signal) => ordersApi.history(id, { signal }), [id]);
  const notesQuery = useApiQuery((signal) => ordersApi.notes(id, { signal }), [id]);

  async function changeStatus(status, note) {
    const { order } = await ordersApi.updateStatus(id, status, note);
    toast.success(`Order #${order.id} is now ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
    query.refetch();
    historyQuery.refetch();
  }

  return (
    <div className="space-y-6">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All orders
      </Link>
      <QueryState query={query} height="h-96">
        {({ order }) => {
          const next = ORDER_TRANSITIONS[order.status] ?? [];
          const placedBy = historyQuery.data?.history?.[0]?.changedBy?.fullName;
          return (
            <>
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
                    Order #{order.id} <OrderStatusBadge status={order.status} />
                  </h1>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Placed {formatDateTime(order.createdAt)}
                    {placedBy ? ` by ${placedBy}` : ''}. Last updated{' '}
                    {formatDateTime(order.updatedAt)}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/orders/${order.id}/invoice`} className={buttonClass('secondary')}>
                    <Printer aria-hidden="true" className="size-4" /> Invoice
                  </Link>
                  {canEdit &&
                    next.map((status) => (
                      <Button
                        key={status}
                        variant={status === 'cancelled' ? 'secondary' : 'primary'}
                        onClick={() => setPending(status)}
                      >
                        {ORDER_ACTION_LABELS[status]}
                      </Button>
                    ))}
                </div>
              </header>

              <Card className="px-5 py-6 sm:px-8">
                {historyQuery.data ? (
                  <OrderProgress
                    status={order.status}
                    history={historyQuery.data.history}
                    createdAt={order.createdAt}
                  />
                ) : (
                  <Skeleton className="h-12 w-full" />
                )}
              </Card>

              <div className="grid items-start gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <ItemsCard order={order} />
                </div>
                <div className="space-y-4">
                  <CustomerCard order={order} />
                  <Card>
                    <CardHeader
                      title="Activity"
                      description="Status changes and staff notes, oldest first."
                    />
                    <div className="px-5 pt-4 pb-5">
                      {historyQuery.data && notesQuery.data ? (
                        <OrderActivity
                          orderId={order.id}
                          history={historyQuery.data.history}
                          notes={notesQuery.data.notes}
                          canEdit={canEdit}
                          onNoteAdded={notesQuery.refetch}
                        />
                      ) : (
                        <Skeleton className="h-24 w-full" />
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              <StatusChangeDialog
                open={Boolean(pending)}
                status={pending}
                title={
                  pending === 'cancelled'
                    ? 'Cancel this order?'
                    : `${ORDER_ACTION_LABELS[pending] ?? ''}?`
                }
                message={
                  pending === 'cancelled'
                    ? 'The ordered quantities go back into stock. This cannot be undone.'
                    : `Order #${order.id} moves from ${ORDER_STATUS_LABELS[order.status].toLowerCase()} to ${ORDER_STATUS_LABELS[pending]?.toLowerCase()}.`
                }
                onClose={() => setPending(null)}
                onConfirm={(note) => changeStatus(pending, note)}
              />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
