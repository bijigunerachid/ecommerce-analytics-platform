import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ordersApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import { DataTable } from '../components/charts/ChartFrame.jsx';
import { OrderStatusBadge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format.js';
import { ORDER_STATUS_LABELS, ORDER_TRANSITIONS } from '../utils/labels.js';

const ACTION_LABELS = {
  paid: 'Mark as paid',
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered',
  cancelled: 'Cancel order',
};

export function OrderDetailPage() {
  const { id } = useParams();
  const { canEdit } = usePermissions();
  const toast = useToast();
  const [pending, setPending] = useState(null); // target status awaiting confirmation
  const query = useApiQuery((signal) => ordersApi.get(id, { signal }), [id]);

  async function changeStatus(status) {
    const { order } = await ordersApi.updateStatus(id, status);
    toast.success(`Order #${order.id} is now ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
    query.refetch();
  }

  return (
    <div className="space-y-4">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All orders
      </Link>
      <QueryState query={query} height="h-96">
        {({ order }) => {
          const next = ORDER_TRANSITIONS[order.status] ?? [];
          return (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="flex items-center gap-3 text-xl font-semibold text-ink">
                    Order #{order.id} <OrderStatusBadge status={order.status} />
                  </h1>
                  <p className="text-sm text-ink-secondary">
                    Placed {formatDateTime(order.createdAt)} · last updated{' '}
                    {formatDateTime(order.updatedAt)}
                  </p>
                </div>
                {canEdit && next.length > 0 && (
                  <div className="flex flex-wrap gap-2" aria-label="Change status">
                    {next.map((status) => (
                      <Button
                        key={status}
                        variant={status === 'cancelled' ? 'secondary' : 'primary'}
                        onClick={() => setPending(status)}
                      >
                        {ACTION_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                )}
              </header>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader
                    title="Items"
                    description="Prices were fixed when the order was placed."
                  />
                  <div className="px-5 pt-3 pb-4">
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
                    <p className="mt-3 flex justify-end gap-6 border-t border-line pt-3 text-sm">
                      <span className="text-ink-secondary">Total</span>
                      <span className="font-semibold text-ink tabular">
                        {formatMoney(order.totalAmount)}
                      </span>
                    </p>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Customer" />
                  <div className="space-y-1 px-5 pt-3 pb-4 text-sm">
                    <p className="font-medium text-ink">{order.customerName}</p>
                    <p className="text-ink-secondary">{order.customerEmail}</p>
                    <Link
                      to={`/orders?customerId=${order.customerId}`}
                      className="inline-block pt-2 text-sm font-medium text-accent hover:underline"
                    >
                      All orders from this customer
                    </Link>
                  </div>
                </Card>
              </div>

              <ConfirmDialog
                open={Boolean(pending)}
                title={
                  pending === 'cancelled'
                    ? 'Cancel this order?'
                    : `${ACTION_LABELS[pending] ?? ''}?`
                }
                message={
                  pending === 'cancelled'
                    ? 'The ordered quantities go back into stock. This cannot be undone.'
                    : `Order #${order.id} will move from ${ORDER_STATUS_LABELS[order.status].toLowerCase()} to ${ORDER_STATUS_LABELS[pending]?.toLowerCase()}.`
                }
                confirmLabel={pending === 'cancelled' ? 'Cancel order' : 'Confirm'}
                danger={pending === 'cancelled'}
                onClose={() => setPending(null)}
                onConfirm={() => changeStatus(pending)}
              />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
