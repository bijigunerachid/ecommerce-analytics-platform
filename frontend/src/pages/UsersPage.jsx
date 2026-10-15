import { KeyRound, Pencil, Plus, UserCog } from 'lucide-react';
import { useState } from 'react';
import { usersApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.js';
import { DataTable } from '../components/charts/ChartFrame.jsx';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { ActiveBadge, Badge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { SwitchField, FormError, SelectField, TextField } from '../components/ui/Field.jsx';
import { Drawer } from '../components/ui/Drawer.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { rules, useForm } from '../hooks/useForm.js';
import { formatDateTime } from '../utils/format.js';
import { newPasswordError } from '../utils/password.js';

const validate = (v) => ({
  fullName: rules.required(v.fullName, 'Full name'),
  email: rules.email(v.email),
  password: newPasswordError(v.password),
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
    <Drawer
      open
      title="New staff account"
      description="Share the password with the person securely. They can change it on their account page."
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
          options={ROLE_OPTIONS}
        />
      </form>
    </Drawer>
  );
}

const ROLE_OPTIONS = [
  { value: 'analyst', label: 'Analyst: read-only access' },
  { value: 'admin', label: 'Admin: full access, including users' },
];

function EditUserModal({ user, isSelf, onClose, onSaved }) {
  const toast = useToast();
  const form = useForm(
    { fullName: user.fullName, role: user.role, isActive: user.isActive },
    (v) => ({ fullName: rules.required(v.fullName, 'Full name') }),
  );

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      const changes = {};
      if (v.fullName.trim() !== user.fullName) changes.fullName = v.fullName.trim();
      if (!isSelf && v.role !== user.role) changes.role = v.role;
      if (!isSelf && v.isActive !== user.isActive) changes.isActive = v.isActive;
      if (Object.keys(changes).length === 0) return;
      const { user: updated } = await usersApi.update(user.id, changes);
      toast.success(`Saved ${updated.email}.`);
    });
    if (ok) onSaved();
  }

  const f = form;
  return (
    <Drawer
      open
      title={`Edit ${user.email}`}
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="edit-user-form" disabled={f.submitting}>
            {f.submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-user-form" onSubmit={save} noValidate className="space-y-4">
        <FormError>{f.formError}</FormError>
        <TextField
          label="Full name"
          required
          maxLength={100}
          value={f.values.fullName}
          onChange={f.setField('fullName')}
          error={f.errors.fullName}
        />
        <SelectField
          label="Role"
          value={f.values.role}
          onChange={f.setField('role')}
          options={ROLE_OPTIONS}
          disabled={isSelf}
          hint={isSelf ? 'You cannot change your own role.' : undefined}
        />
        <SwitchField
          label="Active"
          hint={
            isSelf
              ? 'You cannot deactivate yourself.'
              : 'Inactive accounts cannot sign in. Deactivating signs them out everywhere.'
          }
          checked={f.values.isActive}
          onChange={f.setField('isActive')}
          disabled={isSelf}
        />
      </form>
    </Drawer>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const toast = useToast();
  const form = useForm({ password: '' }, (v) => ({ password: newPasswordError(v.password) }));

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      await usersApi.resetPassword(user.id, v.password);
      toast.success(`Password reset for ${user.email}. They were signed out everywhere.`);
    });
    if (ok) onClose();
  }

  const f = form;
  return (
    <Modal
      open
      title={`Reset password for ${user.email}`}
      description="They are signed out everywhere and sign in with the new password. Share it securely."
      onClose={onClose}
      busy={f.submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" disabled={f.submitting}>
            {f.submitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={save} noValidate className="space-y-4">
        <FormError>{f.formError}</FormError>
        <TextField
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          value={f.values.password}
          onChange={f.setField('password')}
          error={f.errors.password}
          hint="At least 12 characters"
        />
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
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
                {
                  key: 'actions',
                  label: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (u) => (
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label={`Edit ${u.email}`}
                        icon={Pencil}
                        size="icon-sm"
                        onClick={() => setEditing(u)}
                      />
                      {u.id !== me.id && (
                        <IconButton
                          label={`Reset password for ${u.email}`}
                          icon={KeyRound}
                          size="icon-sm"
                          onClick={() => setResetting(u)}
                        />
                      )}
                    </div>
                  ),
                },
              ]}
              rows={data.users.map((u) => ({ ...u, key: u.id }))}
            />
          )}
        </QueryState>
      </Card>
      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            query.refetch();
          }}
        />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
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
