import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { authApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.js';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { FormError, TextField } from '../components/ui/Field.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { rules, useForm } from '../hooks/useForm.js';
import { formatDateTime } from '../utils/format.js';
import { newPasswordError } from '../utils/password.js';

function Section({ icon: Icon, title, description, children }) {
  return (
    <Card>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[16rem_1fr]">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Icon aria-hidden="true" className="size-4 text-ink-muted" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">{description}</p>
        </div>
        <div className="max-w-lg">{children}</div>
      </div>
    </Card>
  );
}

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const form = useForm({ fullName: user.fullName }, (v) => ({
    fullName: rules.required(v.fullName, 'Full name'),
  }));

  async function save(e) {
    e.preventDefault();
    await form.submit(async (v) => {
      const { user: updated } = await authApi.updateProfile({ fullName: v.fullName.trim() });
      updateUser(updated);
      toast.success('Profile saved.');
    });
  }

  const unchanged = form.values.fullName.trim() === user.fullName;
  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <FormError>{form.formError}</FormError>
      <div className="flex items-center gap-3">
        <Avatar name={form.values.fullName || user.fullName} size="lg" />
        <div className="text-sm">
          <p className="text-ink">{user.email}</p>
          <p className="mt-0.5">
            <Badge>{user.role === 'admin' ? 'Admin' : 'Analyst'}</Badge>
          </p>
        </div>
      </div>
      <TextField
        label="Full name"
        required
        maxLength={100}
        value={form.values.fullName}
        onChange={form.setField('fullName')}
        error={form.errors.fullName}
      />
      <p className="text-xs text-ink-muted">Your email and role are managed by an administrator.</p>
      <Button type="submit" disabled={form.submitting || unchanged}>
        {form.submitting ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const form = useForm({ currentPassword: '', newPassword: '', confirmPassword: '' }, (v) => ({
    currentPassword: v.currentPassword ? undefined : 'Enter your current password.',
    newPassword: newPasswordError(v.newPassword),
    confirmPassword:
      v.confirmPassword === v.newPassword ? undefined : 'The passwords do not match.',
  }));

  async function save(e) {
    e.preventDefault();
    const ok = await form.submit(async (v) => {
      await authApi.changePassword({
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
    });
    if (ok) {
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed. You were signed out on other devices.');
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <FormError>{form.formError}</FormError>
      <TextField
        label="Current password"
        type="password"
        required
        autoComplete="current-password"
        value={form.values.currentPassword}
        onChange={form.setField('currentPassword')}
        error={form.errors.currentPassword}
      />
      <TextField
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        value={form.values.newPassword}
        onChange={form.setField('newPassword')}
        error={form.errors.newPassword}
        hint="At least 12 characters. A few unrelated words are easy to remember and hard to guess."
      />
      <TextField
        label="Confirm new password"
        type="password"
        required
        autoComplete="new-password"
        value={form.values.confirmPassword}
        onChange={form.setField('confirmPassword')}
        error={form.errors.confirmPassword}
      />
      <Button type="submit" disabled={form.submitting}>
        {form.submitting ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}

function Sessions() {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-secondary">
        Signed in on a shared or lost device? Sign out everywhere except here.
      </p>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        <LogOut aria-hidden="true" className="size-4" /> Sign out other sessions
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Sign out other sessions?"
        message="Every other browser and device signed in to your account is signed out. This one stays signed in."
        confirmLabel="Sign out other sessions"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await authApi.revokeOtherSessions();
          toast.success('Signed out of all other sessions.');
        }}
      />
    </div>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        icon={UserRound}
        description={
          user.lastLoginAt
            ? `Last sign-in ${formatDateTime(user.lastLoginAt)}.`
            : 'Your profile and sign-in settings.'
        }
      />
      <Section
        icon={UserRound}
        title="Profile"
        description="Your name as other staff see it in order activity and the audit log."
      >
        <ProfileForm />
      </Section>
      <Section
        icon={KeyRound}
        title="Password"
        description={
          user.passwordChangedAt
            ? `Last changed ${formatDateTime(user.passwordChangedAt)}. Changing it signs you out on other devices.`
            : 'Changing it signs you out on other devices.'
        }
      >
        <PasswordForm />
      </Section>
      <Section icon={LogOut} title="Sessions" description="Where your account is signed in.">
        <Sessions />
      </Section>
    </div>
  );
}
