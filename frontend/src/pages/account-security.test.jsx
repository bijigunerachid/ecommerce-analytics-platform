import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

const auditPage = {
  data: [
    {
      id: 2,
      occurredAt: '2026-03-11T10:00:00.000Z',
      actor: { id: 1, email: 'admin@example.test', fullName: 'Ada Admin' },
      action: 'product.updated',
      entityType: 'product',
      entityId: '10',
      summary: 'Updated product Aurora 14" Laptop (ELC-LAPTOP-14)',
      details: { price: { from: '1299.00', to: '1199.00' } },
      ip: '172.18.0.5',
    },
    {
      id: 1,
      occurredAt: '2026-03-11T09:00:00.000Z',
      actor: { id: null, email: 'mallory@example.test', fullName: null },
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: null,
      summary: 'Failed sign-in for mallory@example.test',
      details: {},
      ip: '172.18.0.9',
    },
  ],
  pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
};

describe('account page', () => {
  it('opens from the account menu and saves the name everywhere', async () => {
    let body;
    server.use(
      http.patch(`${API}/auth/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ user: { ...f.adminUser, fullName: body.fullName } });
      }),
    );
    const { user, router } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Account settings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'));

    const name = await screen.findByLabelText(/Full name/);
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Ada Lovelace ');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(body).toEqual({ fullName: 'Ada Lovelace' });
    // The top bar shows the new name without reloading.
    expect(
      screen.getByRole('button', { name: 'Account menu for Ada Lovelace' }),
    ).toBeInTheDocument();
  });

  it('checks the new password, then changes it', async () => {
    let body;
    server.use(
      http.post(`${API}/auth/password`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter your current password.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Current password/), 'old-password');
    await user.type(screen.getByLabelText(/^New password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'correct horse batterx');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Confirm new password/));
    await user.type(screen.getByLabelText(/^Confirm new password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('Password changed. You were signed out on other devices.'),
    ).toBeInTheDocument();
    expect(body).toEqual({
      currentPassword: 'old-password',
      newPassword: 'correct horse battery',
    });
    expect(screen.getByLabelText(/^Current password/)).toHaveValue('');
  });

  it('shows a wrong current password on its field', async () => {
    server.use(
      http.post(`${API}/auth/password`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Current password is incorrect',
              details: [
                {
                  location: 'body',
                  path: 'currentPassword',
                  message: 'Current password is incorrect',
                },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/account');
    await user.type(await screen.findByLabelText(/^Current password/), 'nope');
    await user.type(screen.getByLabelText(/^New password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Current password/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('signs out other sessions after confirmation', async () => {
    let called = false;
    server.use(
      http.post(`${API}/auth/sessions/revoke-others`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Sign out other sessions' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out other sessions?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out other sessions' }));
    expect(await screen.findByText('Signed out of all other sessions.')).toBeInTheDocument();
    expect(called).toBe(true);
  });
});

describe('user administration', () => {
  it('edits another user and resets their password', async () => {
    const requests = [];
    server.use(
      http.patch(`${API}/users/:id`, async ({ request, params }) => {
        requests.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({ user: { ...f.analystUser, isActive: false } });
      }),
      http.post(`${API}/users/:id/password`, async ({ request, params }) => {
        requests.push({ id: params.id, body: await request.json() });
        return HttpResponse.json({ user: f.analystUser });
      }),
    );
    const { user } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: `Edit ${f.analystUser.email}` }));
    let dialog = screen.getByRole('dialog', { name: `Edit ${f.analystUser.email}` });
    await user.click(within(dialog).getByLabelText('Active'));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(
      screen.getByRole('button', { name: `Reset password for ${f.analystUser.email}` }),
    );
    dialog = screen.getByRole('dialog', { name: `Reset password for ${f.analystUser.email}` });
    await user.type(within(dialog).getByLabelText(/New password/), 'temporary passphrase');
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(requests).toEqual([
      { id: '2', body: { isActive: false } },
      { id: '2', body: { password: 'temporary passphrase' } },
    ]);
  });

  it('does not let admins change their own role or status', async () => {
    const { user } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: `Edit ${f.adminUser.email}` }));
    const dialog = screen.getByRole('dialog', { name: `Edit ${f.adminUser.email}` });
    expect(within(dialog).getByLabelText('Role')).toBeDisabled();
    expect(within(dialog).getByLabelText('Active')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: `Reset password for ${f.adminUser.email}` }),
    ).not.toBeInTheDocument();
  });
});

describe('audit log', () => {
  it('lists entries with filters and shows the recorded changes', async () => {
    const queries = [];
    server.use(
      http.get(`${API}/audit-log`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.toString());
        return HttpResponse.json(auditPage);
      }),
    );
    const { user } = renderApp('/audit-log');
    const table = await screen.findByRole('table', { name: 'Audit log' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Product updated');
    expect(within(rows[1]).getByRole('link', { name: 'Open product' })).toHaveAttribute(
      'href',
      '/products/10',
    );
    expect(rows[2]).toHaveTextContent('Failed sign-in');

    await user.selectOptions(screen.getByLabelText('Action'), 'auth.login_failed');
    await waitFor(() => expect(queries.at(-1)).toContain('action=auth.login_failed'));

    await user.click(within(table).getByText(/Updated product Aurora/));
    const dialog = screen.getByRole('dialog', { name: 'Product updated' });
    expect(within(dialog).getByRole('row', { name: /price/ })).toHaveTextContent(
      /1299\.00.*changed to.*1199\.00/,
    );
  });

  it('is in the admin navigation only', async () => {
    signInAsAnalyst();
    const { router } = renderApp('/audit-log');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });
});
