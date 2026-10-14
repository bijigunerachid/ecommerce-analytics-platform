import { Boxes, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { inventoryApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import { EntityPicker } from '../components/data/EntityPicker.jsx';
import { FilterBar, PageHeader, ResourceTable } from '../components/data/ResourceTable.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ExportMenu } from '../components/data/ExportMenu.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FilterSelect, FormError, SelectField, TextField } from '../components/ui/Field.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { AdjustStockModal } from '../features/inventory/AdjustStockModal.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatNumber } from '../utils/format.js';
import { MOVEMENT_REASON_LABELS } from '../utils/labels.js';

export function InventoryPage() {
  const { canEdit } = usePermissions();
  const [adjusting, setAdjusting] = useState(false);
  const { params, update, toggleSort } = useListParams({
    reason: '',
    productId: '',
    dateFrom: '',
    dateTo: '',
    sort: 'createdAt',
    order: 'desc',
  });
  const query = useApiQuery(
    (signal) => inventoryApi.movements(cleanParams({ ...params, pageSize: 25 }), { signal }),
    [params],
  );

  const columns = [
    {
      key: 'createdAt',
      label: 'When',
      sortKey: 'createdAt',
      defaultOrder: 'desc',
      render: (m) => formatDateTime(m.createdAt),
    },
    {
      key: 'product',
      label: 'Product',
      render: (m) => (
        <button
          type="button"
          className="text-left hover:underline"
          onClick={() => update({ productId: String(m.productId) })}
          title="Show only this product"
        >
          <span className="block">{m.productName}</span>
          <span className="block font-mono text-xs text-ink-muted">{m.sku}</span>
        </button>
      ),
    },
    {
      key: 'quantityChange',
      label: 'Change',
      sortKey: 'quantityChange',
      align: 'right',
      render: (m) => (
        <span className={m.quantityChange > 0 ? 'text-text-good' : 'text-ink'}>
          {m.quantityChange > 0 ? '+' : '−'}
          {formatNumber(Math.abs(m.quantityChange))}
        </span>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (m) => <Badge>{MOVEMENT_REASON_LABELS[m.reason] ?? m.reason}</Badge>,
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (m) =>
        m.orderId ? (
          <Link to={`/orders/${m.orderId}`} className="text-accent hover:underline">
            Order #{m.orderId}
          </Link>
        ) : (
          <span className="text-ink-secondary">{m.note ?? '—'}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        icon={Boxes}
        description="The ledger of every stock change: orders, cancellations, restocks, and adjustments."
        actions={
          <>
            <ExportMenu name="inventory-movements" params={cleanParams(params)} />
            {canEdit && (
              <Button onClick={() => setAdjusting(true)}>
                <PackagePlus aria-hidden="true" className="size-4" /> Adjust stock
              </Button>
            )}
          </>
        }
      />
      <Card>
        <FilterBar>
          <FilterSelect
            label="Reason"
            value={params.reason}
            onChange={(e) => update({ reason: e.target.value })}
            options={[
              { value: '', label: 'All reasons' },
              ...Object.entries(MOVEMENT_REASON_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
          {params.productId && (
            <Button variant="secondary" size="sm" onClick={() => update({ productId: '' })}>
              Product #{params.productId} ✕
            </Button>
          )}
        </FilterBar>
        <ResourceTable
          caption="Inventory movements"
          query={query}
          columns={columns}
          rowKey={(m) => m.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
        />
      </Card>
      {adjusting && (
        <AdjustStockModal
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false);
            query.refetch();
          }}
        />
      )}
    </div>
  );
}
