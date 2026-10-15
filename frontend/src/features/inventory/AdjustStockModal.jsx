import { useState } from 'react';
import { inventoryApi, productsApi } from '../../api/endpoints.js';
import { EntityPicker } from '../../components/data/EntityPicker.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FormError, SelectField, TextField } from '../../components/ui/Field.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { useToast } from '../../components/ui/toast-context.js';
import { useForm } from '../../hooks/useForm.js';
import { formatNumber } from '../../utils/format.js';

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

/**
 * Restock or adjust one product's stock. `product` and `quantity` preselect the form (e.g. the
 * product page's restock suggestion).
 */
export function AdjustStockModal({ onClose, onSaved, product = null, quantity = '' }) {
  const toast = useToast();
  // One key per adjustment attempt: a retried submit can't apply the change twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm(
    {
      product,
      quantityChange: quantity === '' ? '' : String(quantity),
      reason: 'restock',
      note: '',
    },
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
    <Drawer
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
    </Drawer>
  );
}
