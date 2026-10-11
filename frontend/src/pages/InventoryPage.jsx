import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { inventoryApi, productsApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import { EntityPicker } from '../components/data/EntityPicker.jsx';
import { FilterBar, PageHeader, ResourceTable } from '../components/data/ResourceTable.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FilterSelect, FormError, SelectField, TextField } from '../components/ui/Field.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { useForm } from '../hooks/useForm.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatNumber } from '../utils/format.js';
import { MOVEMENT_REASON_LABELS } from '../utils/labels.js';

const validate = (v) => ({
  product: v.product ? undefined : 'Choose a product.',
  quantityChange:
    !/^-?\d+$/.test(String(v.quantityChange).trim()) || Number(v.quantityChange) === 0
      ? 'Enter a whole number other than 0 (negative removes stock).'
      : v.reason === 'restock' && Number(v.quantityChange) < 0
        ? 'A restock must add stock. Use an adjustment to remove stock.'
        : v.product && Number(v.quantityChange) + v.product.stockQuantity < 0
          ? `Only ${formatNumber(v.product.stockQuantity)} in stock.`
          : undefined,
});

function AdjustStockModal({ onClose, onSaved }) {
  const toast = useToast();
  // One key per adjustment attempt: a retried submit can't apply the change twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm(
    { product: null, quantityChange: '', reason: 'restock', note: '' },
    validate,
  );

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const body = {
        productId: v.product.id,
        quantityChange: Number(v.quantityChange),
        reason: v.reason,
        ...(v.note.trim() && { note: v.note.trim() }),
      };
      const { movement } = await inventoryApi.adjust(body, idempotencyKey);
      const verb = movement.quantityChange > 0 ? 'Added' : 'Removed';
      toast.success(
        `${verb} ${formatNumber(Math.abs(movement.quantityChange))} × ${movement.sku}.`,
      );
    });
    if (ok) onSaved();
  }

  const f = form;
  return (
    <Modal
      open
      title="Adjust stock"
      description="Every change is recorded in the inventory ledger."
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" disabled={f.submitting}>
            {f.submitting ? 'Saving…' : 'Save adjustment'}
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={save} noValidate className="space-y-4">
        <FormError>{f.formError}</FormError>
        <EntityPicker
          label="Product"
          required
          placeholder="Search by name or SKU"
          value={f.values.product}
          onChange={f.setField('product')}
          error={f.errors.product}
          search={(search, signal) => productsApi.list({ search, pageSize: 8 }, { signal })}
          getLabel={(p) => p.name}
          getDetail={(p) => `${p.sku} · ${formatNumber(p.stockQuantity)} in stock`}
        />
        <SelectField
          label="Reason"
          value={f.values.reason}
          onChange={f.setField('reason')}
          options={[
            { value: 'restock', label: 'Restock: goods received' },
            { value: 'adjustment', label: 'Adjustment: count correction, damage, loss' },
          ]}
        />
        <TextField
          label="Quantity change"
          required
          inputMode="numeric"
          placeholder={f.values.reason === 'restock' ? 'e.g. 50' : 'e.g. -3'}
          value={f.values.quantityChange}
          onChange={f.setField('quantityChange')}
          error={f.errors.quantityChange}
          hint="Positive adds stock, negative removes it"
        />
        <TextField
          label="Note"
          value={f.values.note}
          onChange={f.setField('note')}
          error={f.errors.note}
          maxLength={500}
          placeholder="Optional, e.g. supplier delivery #123"
        />
      </form>
    </Modal>
  );
}

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
        description="The ledger of every stock change: orders, cancellations, restocks, and adjustments."
        actions={
          canEdit && (
            <Button onClick={() => setAdjusting(true)}>
              <PackagePlus aria-hidden="true" className="size-4" /> Adjust stock
            </Button>
          )
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
