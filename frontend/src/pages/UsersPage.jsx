import { Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { usersApi } from '../api/endpoints.js';
import { DataTable } from '../components/charts/ChartFrame.jsx';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { ActiveBadge, Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { FormError, SelectField, TextField } from '../components/ui/Field.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { rules, useForm } from '../hooks/useForm.js';
import { formatDateTime } from '../utils/format.js';

const validate = (v) => ({
  fullName: rules.required(v.fullName, 'Full name'),
  email: rules.email(v.email),
  password:
    v.password.length < 12
      ? 'Use at least 12 characters.'
      : new TextEncoder().encode(v.password).length > 72
        ? 'Use at most 72 bytes.'
        : undefined,
});

function UserForm({ onClose, onSaved }) {
  const toast = useToast();
  const form = useForm({ fullName: '', email: '', password: '', role: 'analyst' }, validate);

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const { user } = await usersApi.create({
        ...v,
        fullName: v.fullName.trim(),
        email: v.email.trim(),
      });
      toast.success(`Account created for ${user.email}.`);
    });
    if (ok) onSaved();
  }

  const f = form;
  return (
    <Modal
      open
      title="New staff account"
      description="Share the password with the person securely; they can't change it yet."
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={f.submitting}>
            {f.submitting ? 'Creating…' : 'Create account'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} noValidate className="space-y-4">
        <FormError>{f.formError}</FormError>
        <TextField
          label="Full name"
          required
          value={f.values.fullName}
          onChange={f.setField('fullName')}
          error={f.errors.fullName}
          maxLength={100}
        />
        <TextField
          label="Email"
          type="email"
          required
          autoComplete="off"
          value={f.values.email}
          onChange={f.setField('email')}
          error={f.errors.email}
        />
        <TextField
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={f.values.password}
          onChange={f.setField('password')}
          error={f.errors.password}
          hint="At least 12 characters"
        />
        <SelectField
          label="Role"
          value={f.values.role}
          onChange={f.setField('role')}
          options={[
            { value: 'analyst', label: 'Analyst: read-only access' },
            { value: 'admin', label: 'Admin: full access, including users' },
          ]}
        />
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const [creating, setCreating] = useState(false);
  const query = useApiQuery((signal) => usersApi.list({ signal }), []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        icon={UserCog}
        description="Staff accounts. Admins manage everything; analysts can view."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" /> New user
          </Button>
        }
      />
      <Card className="p-4">
        <QueryState query={query} isEmpty={(d) => d.users.length === 0}>
          {(data) => (
            <DataTable
              caption="Users"
              maxHeight=""
              columns={[
                {
                  key: 'fullName',
                  label: 'Name',
                  render: (u) => <span className="font-medium">{u.fullName}</span>,
                },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Role', render: (u) => <Badge>{u.role}</Badge> },
                {
                  key: 'isActive',
                  label: 'Status',
                  render: (u) => <ActiveBadge active={u.isActive} />,
                },
                {
                  key: 'lastLoginAt',
                  label: 'Last sign-in',
                  render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'),
                },
              ]}
              rows={data.users.map((u) => ({ ...u, key: u.id }))}
            />
          )}
        </QueryState>
      </Card>
      {creating && (
        <UserForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            query.refetch();
          }}
        />
      )}
    </div>
  );
}
