import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { categoriesApi } from '../api/endpoints.js';
import { usePermissions } from '../auth/usePermissions.js';
import {
  FilterBar,
  PageHeader,
  ResourceTable,
  SearchInput,
} from '../components/data/ResourceTable.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { FormError, TextAreaField, TextField } from '../components/ui/Field.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { rules, useForm } from '../hooks/useForm.js';
import { cleanParams, useListParams } from '../hooks/useListParams.js';
import { formatDateTime, formatNumber } from '../utils/format.js';

const validate = (v) => ({ name: rules.required(v.name, 'Name') });

function CategoryForm({ category, onClose, onSaved }) {
  const form = useForm(
    { name: category?.name ?? '', description: category?.description ?? '' },
    validate,
  );
  const toast = useToast();

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const body = { name: v.name.trim(), description: v.description };
      const { category: saved } = category
        ? await categoriesApi.update(category.id, body)
        : await categoriesApi.create(body);
      toast.success(`Category “${saved.name}” ${category ? 'updated' : 'created'}.`);
    });
    if (ok) onSaved();
  }

  return (
    <Drawer
      open
      title={category ? 'Edit category' : 'New category'}
      onClose={onClose}
      busy={form.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={form.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={form.submitting}>
            {form.submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={save} noValidate className="space-y-4">
        <FormError>{form.formError}</FormError>
        <TextField
          label="Name"
          required
          value={form.values.name}
          onChange={form.setField('name')}
          error={form.errors.name}
          maxLength={100}
        />
        <TextAreaField
          label="Description"
          value={form.values.description}
          onChange={form.setField('description')}
          error={form.errors.description}
          maxLength={2000}
        />
      </form>
    </Drawer>
  );
}

export function CategoriesPage() {
  const { canEdit } = usePermissions();
  const toast = useToast();
  const { params, update, toggleSort } = useListParams({ search: '', sort: 'name', order: 'asc' });
  const [editing, setEditing] = useState(null); // null | 'new' | category
  const [deleting, setDeleting] = useState(null);

  const query = useApiQuery(
    (signal) => categoriesApi.list(cleanParams({ ...params, pageSize: 20 }), { signal }),
    [params],
  );

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortKey: 'name',
      render: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: 'description',
      label: 'Description',
      render: (c) => (
        <span className="line-clamp-2 text-ink-secondary">{c.description ?? '—'}</span>
      ),
    },
    {
      key: 'productCount',
      label: 'Products',
      sortKey: 'productCount',
      align: 'right',
      defaultOrder: 'desc',
      render: (c) => formatNumber(c.productCount),
    },
    {
      key: 'createdAt',
      label: 'Created',
      sortKey: 'createdAt',
      defaultOrder: 'desc',
      render: (c) => formatDateTime(c.createdAt),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            label: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (c) => (
              <div className="flex justify-end gap-1">
                <IconButton
                  label={`Edit ${c.name}`}
                  icon={Pencil}
                  size="icon-sm"
                  onClick={() => setEditing(c)}
                />
                <IconButton
                  label={`Delete ${c.name}`}
                  icon={Trash2}
                  size="icon-sm"
                  variant="subtle-danger"
                  onClick={() => setDeleting(c)}
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
        title="Categories"
        icon={Tags}
        description="Group products for browsing and reporting."
        actions={
          canEdit && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" className="size-4" /> New category
            </Button>
          )
        }
      />
      <Card>
        <FilterBar>
          <SearchInput
            label="Search categories"
            placeholder="Search by name"
            value={params.search}
            onChange={(search) => update({ search })}
          />
        </FilterBar>
        <ResourceTable
          caption="Categories"
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
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            query.refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete category?"
        message={
          deleting &&
          `“${deleting.name}” will be removed. Categories that still contain products cannot be deleted.`
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await categoriesApi.remove(deleting.id);
          toast.success(`Category “${deleting.name}” deleted.`);
          query.refetch();
        }}
      />
    </div>
  );
}
