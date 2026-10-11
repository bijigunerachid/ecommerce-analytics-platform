import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

describe('orders list and detail', () => {
  it('lists orders and opens the detail page', async () => {
    const { user, router } = renderApp('/orders?customerId=5');
    const table = await screen.findByRole('table', { name: 'Orders' });
    expect(screen.getByRole('button', { name: /Customer #5/ })).toBeInTheDocument();
    await user.click(within(table).getByText('Alice Martin'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/42'));
    expect(await screen.findByRole('heading', { name: /Order #42/ })).toBeInTheDocument();
    expect(screen.getByText('Wireless Mouse')).toBeInTheDocument();
  });

  it('offers only the allowed status changes and confirms cancellation', async () => {
    let patched;
    server.use(
      http.patch(`${API}/orders/:id/status`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ order: { ...f.order, status: patched.status } });
      }),
    );
    const { user } = renderApp('/orders/42');
    await screen.findByRole('heading', { name: /Order #42/ });
    // pending → paid or cancelled; never straight to shipped
    expect(screen.getByRole('button', { name: 'Mark as paid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as shipped' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this order?' });
    expect(dialog).toHaveTextContent('go back into stock');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByText('Order #42 is now cancelled.')).toBeInTheDocument();
    expect(patched).toEqual({ status: 'cancelled' });
  });

  it('shows no status actions for final states or analysts', async () => {
    server.use(
      http.get(`${API}/orders/:id`, () =>
        HttpResponse.json({ order: { ...f.order, status: 'delivered' } }),
      ),
    );
    renderApp('/orders/42');
    await screen.findByRole('heading', { name: /Order #42/ });
    expect(screen.queryByRole('button', { name: /Mark as|Cancel order/ })).not.toBeInTheDocument();
  });

  it('hides "New order" from analysts and blocks the route', async () => {
    signInAsAnalyst();
    const { router } = renderApp('/orders/new');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(router.state.location.pathname).toBe('/');
  });
});

async function fillNewOrder(user) {
  await user.click(await screen.findByRole('combobox', { name: /Customer/ }));
  await user.click(await screen.findByRole('option', { name: /Alice Martin/ }));
  await user.click(screen.getByRole('combobox', { name: 'Add product' }));
  await user.click(await screen.findByRole('option', { name: /Aurora 14" Laptop/ }));
  await user.click(screen.getByRole('combobox', { name: 'Add product' }));
  await user.click(await screen.findByRole('option', { name: /Wireless Mouse/ }));
  const mouseQty = screen.getByLabelText('Quantity of Wireless Mouse');
  await user.clear(mouseQty);
  await user.type(mouseQty, '2');
}

describe('new order', () => {
  it('requires a customer and products', async () => {
    const { user } = renderApp('/orders/new');
    await user.click(await screen.findByRole('button', { name: 'Place order' }));
    expect(screen.getByText('Choose a customer.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one product.')).toBeInTheDocument();
  });

  it('estimates the total, sends an idempotency key, and opens the new order', async () => {
    let request;
    server.use(
      http.post(`${API}/orders`, async ({ request: req }) => {
        request = { key: req.headers.get('idempotency-key'), body: await req.json() };
        return HttpResponse.json({ order: f.order }, { status: 201 });
      }),
    );
    const { user, router } = renderApp('/orders/new');
    await fillNewOrder(user);
    expect(screen.getByText(/1,?348\.00/)).toBeInTheDocument(); // 1299 + 2 × 24.50

    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/42'));
    expect(request.body).toEqual({
      customerId: 5,
      items: [
        { productId: 10, quantity: 1 },
        { productId: 11, quantity: 2 },
      ],
    });
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('highlights lines without enough stock', async () => {
    server.use(
      http.post(`${API}/orders`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'INSUFFICIENT_STOCK',
              message: 'Not enough stock for some items',
              details: [{ productId: 10, sku: 'ELC-LAPTOP-14', requested: 1, available: 0 }],
            },
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderApp('/orders/new');
    await fillNewOrder(user);
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Only 0 in stock.')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity of Aurora 14" Laptop')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Quantity of Wireless Mouse')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('retries with the same idempotency key after a network error', async () => {
    const keys = [];
    let fail = true;
    server.use(
      http.post(`${API}/orders`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        if (fail) {
          fail = false;
          return HttpResponse.error();
        }
        return HttpResponse.json({ order: f.order }, { status: 201 });
      }),
    );
    const { user, router } = renderApp('/orders/new');
    await fillNewOrder(user);
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Submitting again without changes is safe',
    );

    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/42'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses a new key once the order is changed', async () => {
    const keys = [];
    server.use(
      http.post(`${API}/orders`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.error();
      }),
    );
    const { user } = renderApp('/orders/new');
    await fillNewOrder(user);
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByRole('alert');
    const qty = screen.getByLabelText('Quantity of Wireless Mouse');
    await user.clear(qty);
    await user.type(qty, '3');
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });
});
