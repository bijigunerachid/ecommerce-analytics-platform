import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

describe('inventory', () => {
  it('shows the ledger with links to orders and filters by reason', async () => {
    const requests = [];
    server.use(
      http.get(`${API}/inventory/movements`, async ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        const { movementsList } = await import('../test/fixtures.js');
        return HttpResponse.json(movementsList);
      }),
    );
    const { user, router } = renderApp('/inventory');
    const table = await screen.findByRole('table', { name: 'Inventory movements' });
    expect(within(table).getByRole('link', { name: 'Order #42' })).toHaveAttribute(
      'href',
      '/orders/42',
    );
    expect(within(table).getByText('Supplier delivery')).toBeInTheDocument();
    expect(within(table).getByText('+50')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Reason'), 'restock');
    await waitFor(() => expect(router.state.location.search).toBe('?reason=restock'));
    await waitFor(() => expect(requests.at(-1).get('reason')).toBe('restock'));
  });

  it('adjusts stock with validation and an idempotency key', async () => {
    let request;
    server.use(
      http.post(`${API}/inventory/adjustments`, async ({ request: req }) => {
        request = { key: req.headers.get('idempotency-key'), body: await req.json() };
        return HttpResponse.json(
          {
            movement: {
              id: 3,
              productId: 10,
              sku: 'ELC-LAPTOP-14',
              quantityChange: 5,
              reason: 'restock',
            },
          },
          { status: 201 },
        );
      }),
    );
    const { user } = renderApp('/inventory');
    await user.click(await screen.findByRole('button', { name: 'Adjust stock' }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust stock' });

    await user.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('Choose a product.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('combobox', { name: /Product/ }));
    await user.click(await within(dialog).findByRole('option', { name: /Aurora 14" Laptop/ }));
    await user.type(within(dialog).getByLabelText(/Quantity change/), '-2');
    await user.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText(/A restock must add stock/)).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'adjustment');
    const qty = within(dialog).getByLabelText(/Quantity change/);
    await user.clear(qty);
    await user.type(qty, '-9'); // only 3 in stock
    await user.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('Only 3 in stock.')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'restock');
    await user.clear(qty);
    await user.type(qty, '5');
    await user.type(within(dialog).getByLabelText('Note'), 'Delivery 77');
    await user.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));

    expect(await screen.findByText('Added 5 × ELC-LAPTOP-14.')).toBeInTheDocument();
    expect(request.body).toEqual({
      productId: 10,
      quantityChange: 5,
      reason: 'restock',
      note: 'Delivery 77',
    });
    expect(request.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is read-only for analysts', async () => {
    signInAsAnalyst();
    renderApp('/inventory');
    await screen.findByRole('table', { name: 'Inventory movements' });
    expect(screen.queryByRole('button', { name: 'Adjust stock' })).not.toBeInTheDocument();
  });
});
