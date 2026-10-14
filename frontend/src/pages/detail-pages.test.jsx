import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

describe('customer page', () => {
  it('shows the profile, lifetime figures, spend, top products, and orders', async () => {
    let ordersQuery;
    server.use(
      http.get(`${API}/orders`, ({ request }) => {
        ordersQuery = new URL(request.url).searchParams;
        return HttpResponse.json(f.ordersList);
      }),
    );
    renderApp('/customers/5');
    expect(await screen.findByRole('heading', { name: /Alice Martin/ })).toBeInTheDocument();
    expect(await screen.findByText('Returning')).toBeInTheDocument();
    expect(screen.getByText('Lyon, France')).toBeInTheDocument();
    expect(screen.getByText('Lifetime value').nextElementSibling).toHaveTextContent(/1,?348\.00/);
    expect(screen.getByText('1 more cancelled')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Spend per month' })).toBeInTheDocument();
    const top = screen.getByRole('list', { name: 'Most bought products' });
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('Aurora 14" Laptop');
    expect(
      await screen.findByRole('table', { name: 'Orders of this customer' }),
    ).toBeInTheDocument();
    expect(ordersQuery.get('customerId')).toBe('5');
  });

  it('offers the monthly spend as a table', async () => {
    const { user } = renderApp('/customers/5');
    const panel = await screen.findByRole('region', { name: 'Spend per month' });
    await user.click(within(panel).getByRole('radio', { name: 'Table' }));
    const table = within(panel).getByRole('table', { name: 'Spend per month' });
    expect(within(table).getAllByRole('row')).toHaveLength(13); // header + 12 months
  });

  it('is reachable from the customers list', async () => {
    const { user, router } = renderApp('/customers');
    await user.click(await screen.findByRole('link', { name: 'Alice Martin' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/customers/5'));
  });

  it('shows a not-found state for unknown customers', async () => {
    server.use(
      http.get(`${API}/customers/:id`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
          { status: 404 },
        ),
      ),
    );
    renderApp('/customers/999');
    expect(await screen.findByText('Customer not found')).toBeInTheDocument();
  });
});

describe('product page', () => {
  it('shows sales, stock history, and a restock suggestion', async () => {
    renderApp('/products/10');
    expect(await screen.findByRole('heading', { name: /Aurora 14" Laptop/ })).toBeInTheDocument();
    expect(await screen.findByText('Restock soon')).toBeInTheDocument();
    expect(screen.getByText('Days of stock left').nextElementSibling).toHaveTextContent('4.5');
    expect(screen.getByRole('region', { name: 'Units sold per day' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Stock at end of day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restock 25' })).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: 'Stock movements of this product' }),
    ).toBeInTheDocument();
  });

  it('changes the period', async () => {
    const requested = [];
    server.use(
      http.get(`${API}/products/:id/insights`, ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('days'));
        return HttpResponse.json(f.productInsights);
      }),
    );
    const { user, router } = renderApp('/products/10');
    await user.click(await screen.findByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(requested).toEqual(['90', '30']));
    expect(router.state.location.search).toBe('?days=30');
  });

  it('restocks the suggested quantity with an idempotency key and refreshes', async () => {
    let request;
    let insightsCalls = 0;
    server.use(
      http.post(`${API}/inventory/adjustments`, async ({ request: req }) => {
        request = { key: req.headers.get('Idempotency-Key'), body: await req.json() };
        return HttpResponse.json(
          { movement: { quantityChange: 25, sku: 'ELC-LAPTOP-14' } },
          { status: 201 },
        );
      }),
      http.get(`${API}/products/:id/insights`, () => {
        insightsCalls += 1;
        return HttpResponse.json(f.productInsights);
      }),
    );
    const { user } = renderApp('/products/10');
    await user.click(await screen.findByRole('button', { name: 'Restock 25' }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust stock' });
    expect(within(dialog).getByLabelText(/Quantity change/)).toHaveValue('25');
    await user.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));

    expect(await screen.findByText('Added 25 × ELC-LAPTOP-14.')).toBeInTheDocument();
    expect(request.body).toEqual({ productId: 10, quantityChange: 25, reason: 'restock' });
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(insightsCalls).toBe(2));
  });

  it('hides the restock action from analysts', async () => {
    signInAsAnalyst();
    renderApp('/products/10');
    expect(await screen.findByText('Restock soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restock/ })).not.toBeInTheDocument();
  });

  it('is reachable from the products list', async () => {
    const { user, router } = renderApp('/products');
    await user.click(await screen.findByRole('link', { name: 'Aurora 14" Laptop' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/10'));
  });
});
