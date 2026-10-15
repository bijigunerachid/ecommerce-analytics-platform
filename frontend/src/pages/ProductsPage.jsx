import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { categoriesApi, productsApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import {
  FilterBar,
  PageHeader,
  ResourceTable,
  SearchInput,
} from '../components/data/ResourceTable.jsx';
import { ActiveBadge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { ExportMenu } from '../components/data/ExportMenu.jsx';
import { Card } from '../components/ui/Card.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import {
  SwitchField,
  FilterSelect,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from '../components/ui/Field.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { rules, useForm } from '../hooks/useForm.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { currencySymbol, formatMoney, formatNumber } from '../utils/format.js';

function useCategoryOptions() {
  // Category lists are short; 100 covers every realistic catalog for a select.
  const query = useApiQuery(
    (signal) => categoriesApi.list({ pageSize: 100, sort: 'name' }, { signal }),
    [],
  );
  return query.data?.data ?? [];
}

function validateProduct(isNew) {
  return (v) => ({
    sku: /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(v.sku.trim())
      ? undefined
      : 'Use 2–40 letters, digits, "-" or "_".',
    name: rules.required(v.name, 'Name'),
    categoryId: v.categoryId ? undefined : 'Choose a category.',
    price: rules.money(v.price),
    reorderLevel: rules.wholeNumber(v.reorderLevel),
    initialStock: isNew ? rules.wholeNumber(v.initialStock) : undefined,
  });
}

function ProductForm({ product, onClose, onSaved }) {
  const isNew = !product;
  const categories = useCategoryOptions();
  const toast = useToast();
  const form = useForm(
    {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      description: product?.description ?? '',
      categoryId: product ? String(product.categoryId) : '',
      price: product?.price ?? '',
      reorderLevel: String(product?.reorderLevel ?? 10),
      initialStock: '0',
      isActive: product?.isActive ?? true,
    },
    validateProduct(isNew),
  );

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const body = {
        sku: v.sku.trim(),
        name: v.name.trim(),
        description: v.description,
        categoryId: Number(v.categoryId),
        price: v.price.trim(),
        reorderLevel: Number(v.reorderLevel),
        isActive: v.isActive,
        ...(isNew && { initialStock: Number(v.initialStock) }),
      };
      const { product: saved } = isNew
        ? await productsApi.create(body)
        : await productsApi.update(product.id, body);
      toast.success(`Product ${saved.sku} ${isNew ? 'created' : 'updated'}.`);
    });
    if (ok) onSaved();
  }

  const f = form;
  return (
    <Drawer
      open
      size="lg"
      title={isNew ? 'New product' : `Edit ${product.sku}`}
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={f.submitting}>
            {f.submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError>{f.formError}</FormError>
        </div>
        <TextField
          label="SKU"
          required
          value={f.values.sku}
          onChange={f.setField('sku')}
          error={f.errors.sku}
          hint="Stored in uppercase"
          maxLength={40}
        />
        <TextField
          label="Name"
          required
          value={f.values.name}
          onChange={f.setField('name')}
          error={f.errors.name}
          maxLength={200}
        />
        <SelectField
          label="Category"
          required
          value={f.values.categoryId}
          onChange={f.setField('categoryId')}
          error={f.errors.categoryId}
          options={[
            { value: '', label: 'Choose a category' },
            ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          ]}
        />
        <TextField
          label="Price"
          required
          inputMode="decimal"
          prefix={currencySymbol()}
          value={f.values.price}
          onChange={f.setField('price')}
          error={f.errors.price}
          placeholder="19.99"
        />
        <TextField
          label="Reorder level"
          inputMode="numeric"
          value={f.values.reorderLevel}
          onChange={f.setField('reorderLevel')}
          error={f.errors.reorderLevel}
          hint="Flagged as low stock at or below this"
        />
        {isNew ? (
          <TextField
            label="Initial stock"
            inputMode="numeric"
            value={f.values.initialStock}
            onChange={f.setField('initialStock')}
            error={f.errors.initialStock}
            hint="Recorded in the inventory ledger"
          />
        ) : (
          <p className="self-end text-xs text-ink-muted">
            Stock ({formatNumber(product.stockQuantity)}) changes only through orders and inventory
            adjustments.
          </p>
        )}
        <TextAreaField
          className="sm:col-span-2"
          label="Description"
          value={f.values.description}
          onChange={f.setField('description')}
          error={f.errors.description}
          maxLength={2000}
        />
        <SwitchField
          className="sm:col-span-2"
          label="Active"
          hint="Inactive products cannot be ordered"
          checked={f.values.isActive}
          onChange={f.setField('isActive')}
        />
      </form>
    </Drawer>
  );
}

function StockCell({ product }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {formatNumber(product.stockQuantity)}
      {product.stockQuantity === 0 ? (
        <StatusBadge status="critical" label="Out" />
      ) : product.isLowStock ? (
        <StatusBadge status="warning" label="Low" />
      ) : null}
    </span>
  );
}

export function ProductsPage() {
  const { canEdit } = usePermissions();
  const toast = useToast();
  const categories = useCategoryOptions();
  const { params, update, toggleSort } = useListParams({
    search: '',
    categoryId: '',
    isActive: '',
    lowStock: '',
    sort: 'name',
    order: 'asc',
  });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useApiQuery(
    (signal) => productsApi.list(cleanParams({ ...params, pageSize: 20 }), { signal }),
    [params],
  );

  const columns = [
    {
      key: 'sku',
      label: 'SKU',
      sortKey: 'sku',
      render: (p) => <span className="font-mono text-xs">{p.sku}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      sortKey: 'name',
      render: (p) => (
        <Link to={`/products/${p.id}`} className="font-medium hover:text-accent hover:underline">
          {p.name}
        </Link>
      ),
    },
    {
      key: 'categoryName',
      label: 'Category',
      render: (p) => <span className="text-ink-secondary">{p.categoryName}</span>,
    },
    {
      key: 'price',
      label: 'Price',
      sortKey: 'price',
      align: 'right',
      render: (p) => formatMoney(p.price),
    },
    {
      key: 'stockQuantity',
      label: 'Stock',
      sortKey: 'stockQuantity',
      align: 'right',
      render: (p) => <StockCell product={p} />,
    },
    { key: 'isActive', label: 'Status', render: (p) => <ActiveBadge active={p.isActive} /> },
    ...(canEdit
      ? [
          {
            key: 'actions',
            label: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (p) => (
              <div className="flex justify-end gap-1">
                <IconButton
                  label={`Edit ${p.sku}`}
                  icon={Pencil}
                  size="icon-sm"
                  onClick={() => setEditing(p)}
                />
                <IconButton
                  label={`Delete ${p.sku}`}
                  icon={Trash2}
                  size="icon-sm"
                  variant="subtle-danger"
                  onClick={() => setDeleting(p)}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        icon={Package}
        description="Catalog, prices, and current stock."
        actions={
          <>
            <ExportMenu name="products" params={cleanParams(params)} />
            {canEdit && (
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" className="size-4" /> New product
              </Button>
            )}
          </>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput
            label="Search products"
            placeholder="Search name or SKU"
            value={params.search}
            onChange={(search) => update({ search })}
          />
          <FilterSelect
            label="Category"
            value={params.categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
          <FilterSelect
            label="Status"
            value={params.isActive}
            onChange={(e) => update({ isActive: e.target.value })}
            options={[
              { value: '', label: 'Any status' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
          <FilterSelect
            label="Stock"
            value={params.lowStock}
            onChange={(e) => update({ lowStock: e.target.value })}
            options={[
              { value: '', label: 'Any stock level' },
              { value: 'true', label: 'Low stock' },
              { value: 'false', label: 'Healthy stock' },
            ]}
          />
        </FilterBar>
        <ResourceTable
          caption="Products"
          query={query}
          columns={columns}
          rowKey={(p) => p.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
        />
      </Card>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            query.refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete product?"
        message={
          deleting &&
          `${deleting.sku} “${deleting.name}” will be removed permanently. Products with order or inventory history cannot be deleted; deactivate them instead.`
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await productsApi.remove(deleting.id);
          toast.success(`Product ${deleting.sku} deleted.`);
          query.refetch();
        }}
      />
    </div>
  );
}
