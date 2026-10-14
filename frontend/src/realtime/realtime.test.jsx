import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { FakeEventSource } from '../test/fake-event-source.js';
import { renderApp } from '../test/render.jsx';
import { API, server } from '../test/server.js';

async function connectedStream() {
  await waitFor(() => expect(FakeEventSource.latest()).toBeDefined());
  const source = FakeEventSource.latest();
  act(() => source.open());
  return source;
}

describe('live stream', () => {
  it('connects once signed in, with the session cookie', async () => {
    renderApp('/');
    const source = await connectedStream();
    expect(source.url).toBe('http://localhost/api/stream');
    expect(source.withCredentials).toBe(true);
  });

  it('does not connect on the sign-in page', async () => {
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
      ),
    );
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('signs out when the server ends the session', async () => {
    const { router } = renderApp('/');
    const source = await connectedStream();
    act(() => source.emit('session-ended', {}));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(source.closed).toBe(true);
  });
});

describe('notification bell', () => {
  it('shows the unread count and lists notifications with links', async () => {
    const { user, router } = renderApp('/');
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    const links = within(panel).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Aurora 14" Laptop is low on stock (unread)');
    expect(links[1]).toHaveAttribute('href', '/orders/42');
    await user.click(links[0]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/10'));
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('marks everything as read', async () => {
    let marked = false;
    server.use(
      http.post(`${API}/notifications/read`, () => {
        marked = true;
        return HttpResponse.json({ unreadCount: 0 });
      }),
      http.get(`${API}/notifications`, () =>
        HttpResponse.json(
          marked
            ? {
                unreadCount: 0,
                notifications: f.notificationsList.notifications.map((n) => ({
                  ...n,
                  unread: false,
                })),
              }
            : f.notificationsList,
        ),
      ),
    );
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(marked).toBe(true);
  });

  it('refreshes when a notification arrives and alerts on critical ones', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/notifications`, () => {
        calls += 1;
        return HttpResponse.json(
          calls === 1 ? { unreadCount: 0, notifications: [] } : f.notificationsList,
        );
      }),
    );
    renderApp('/');
    await screen.findByRole('button', { name: 'Notifications' });
    const source = await connectedStream();
    act(() =>
      source.emit('notification', {
        type: 'notification',
        kind: 'out_of_stock',
        severity: 'critical',
        title: 'Desk Lamp is out of stock',
      }),
    );
    expect(await screen.findByText('Desk Lamp is out of stock')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the bell', async () => {
    const { user } = renderApp('/');
    const bell = await screen.findByRole('button', { name: /Notifications/ });
    await user.click(bell);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });
});

describe('live activity', () => {
  it('lists recent activity and adds pushed orders on top', async () => {
    renderApp('/');
    const panel = await screen.findByRole('region', { name: 'Live activity' });
    const list = await within(panel).findByRole('list', { name: 'Recent order activity' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);

    const source = await connectedStream();
    expect(within(panel).getByRole('status')).toHaveTextContent('Live');
    act(() =>
      source.emit('order', {
        type: 'order.created',
        eventId: 'e2',
        occurredAt: new Date().toISOString(),
        orderId: 43,
        customerName: 'Bob Stone',
        totalAmount: '99.90',
      }),
    );
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Bob Stone placed an order');
    expect(items[0]).toHaveTextContent('Order #43');
    // A repeated event (e.g. after reconnecting) is shown once.
    act(() => source.emit('order', { type: 'order.created', eventId: 'e1', orderId: 42 }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows when the connection drops and refetches after it recovers', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/activity`, () => {
        calls += 1;
        return HttpResponse.json(f.activity);
      }),
    );
    renderApp('/');
    const panel = await screen.findByRole('region', { name: 'Live activity' });
    const source = await connectedStream();
    act(() => source.fail());
    expect(within(panel).getByRole('status')).toHaveTextContent('Reconnecting…');
    act(() => source.open());
    expect(within(panel).getByRole('status')).toHaveTextContent('Live');
    await waitFor(() => expect(calls).toBe(2));
  });
});
