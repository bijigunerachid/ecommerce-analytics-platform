import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { customersApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import {
  FilterBar,
  PageHeader,
  ResourceTable,
  SearchInput,
} from '../components/data/ResourceTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { FormError, TextField } from '../components/ui/Field.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { rules, useForm } from '../hooks/useForm.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format.js';

const validate = (v) => ({
  email: rules.email(v.email),
  firstName: rules.required(v.firstName, 'First name'),
  lastName: rules.required(v.lastName, 'Last name'),
  phone:
    !v.phone.trim() || /^\+?[0-9 ()-]{5,20}$/.test(v.phone.trim())
      ? undefined
      : 'Use digits, spaces, "+", "(", ")" or "-".',
});

function CustomerForm({ customer, onClose, onSaved }) {
  const toast = useToast();
  const form = useForm(
    {
      email: customer?.email ?? '',
      firstName: customer?.firstName ?? '',
      lastName: customer?.lastName ?? '',
      phone: customer?.phone ?? '',
      city: customer?.city ?? '',
      country: customer?.country ?? '',
    },
    validate,
  );

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const body = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val.trim()]));
      const { customer: saved } = customer
        ? await customersApi.update(customer.id, body)
        : await customersApi.create(body);
      toast.success(
        `Customer ${saved.firstName} ${saved.lastName} ${customer ? 'updated' : 'created'}.`,
      );
    });
    if (ok) onSaved();
  }

  const f = form;
  return (
    <Modal
      open
      size="lg"
      title={customer ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" disabled={f.submitting}>
            {f.submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError>{f.formError}</FormError>
        </div>
        <TextField
          label="First name"
          required
          value={f.values.firstName}
          onChange={f.setField('firstName')}
          error={f.errors.firstName}
          maxLength={100}
        />
        <TextField
          label="Last name"
          required
          value={f.values.lastName}
          onChange={f.setField('lastName')}
          error={f.errors.lastName}
          maxLength={100}
        />
        <TextField
          className="sm:col-span-2"
          label="Email"
          type="email"
          required
          value={f.values.email}
          onChange={f.setField('email')}
          error={f.errors.email}
        />
        <TextField
          label="Phone"
          type="tel"
          value={f.values.phone}
          onChange={f.setField('phone')}
          error={f.errors.phone}
        />
        <TextField
          label="City"
          value={f.values.city}
          onChange={f.setField('city')}
          error={f.errors.city}
          maxLength={100}
        />
        <TextField
          label="Country"
          value={f.values.country}
          onChange={f.setField('country')}
          error={f.errors.country}
          maxLength={100}
        />
      </form>
    </Modal>
  );
}

export function CustomersPage() {
  const { canEdit } = usePermissions();
  const toast = useToast();
  const { params, update, toggleSort } = useListParams({
    search: '',
    country: '',
    sort: 'name',
    order: 'asc',
  });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useApiQuery(
    (signal) => customersApi.list(cleanParams({ ...params, pageSize: 20 }), { signal }),
    [params],
  );

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortKey: 'name',
      render: (c) => (
        <div>
          <p className="font-medium">
            {c.firstName} {c.lastName}
          </p>
          <p className="text-xs text-ink-muted">{c.email}</p>
        </div>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      render: (c) => (
        <span className="text-ink-secondary">
          {[c.city, c.country].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'orderCount',
      label: 'Orders',
      sortKey: 'orderCount',
      align: 'right',
      defaultOrder: 'desc',
      render: (c) => formatNumber(c.orderCount),
    },
    {
      key: 'totalSpent',
      label: 'Total spent',
      sortKey: 'totalSpent',
      align: 'right',
      defaultOrder: 'desc',
      render: (c) => formatMoney(c.totalSpent),
    },
    {
      key: 'lastOrderAt',
      label: 'Last order',
      render: (c) => (c.lastOrderAt ? formatDateTime(c.lastOrderAt) : '—'),
    },
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Link
            to={`/orders?customerId=${c.id}`}
            aria-label={`Orders of ${c.firstName} ${c.lastName}`}
            title="View orders"
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-sunken hover:text-ink"
          >
            <ReceiptText aria-hidden="true" className="size-4" />
          </Link>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${c.firstName} ${c.lastName}`}
                onClick={() => setEditing(c)}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c.firstName} ${c.lastName}`}
                onClick={() => setDeleting(c)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description="Order counts and spending exclude cancelled orders."
        actions={
          canEdit && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" className="size-4" /> New customer
            </Button>
          )
        }
      />
      <Card>
        <FilterBar>
          <SearchInput
            label="Search customers"
            placeholder="Search name or email"
            value={params.search}
            onChange={(search) => update({ search })}
          />
          <SearchInput
            label="Filter by country"
            placeholder="Country"
            value={params.country}
            onChange={(country) => update({ country })}
          />
        </FilterBar>
        <ResourceTable
          caption="Customers"
          query={query}
          columns={columns}
          rowKey={(c) => c.id}
          sort={params.sort}
          order={params.order}
          onSort={toggleSort}
          onPageChange={(page) => update({ page })}
        />
      </Card>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            query.refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete customer?"
        message={
          deleting &&
          `${deleting.firstName} ${deleting.lastName} will be removed. Customers with orders cannot be deleted.`
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await customersApi.remove(deleting.id);
          toast.success(`Customer ${deleting.firstName} ${deleting.lastName} deleted.`);
          query.refetch();
        }}
      />
    </div>
  );
}
