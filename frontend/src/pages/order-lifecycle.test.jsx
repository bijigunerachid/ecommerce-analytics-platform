import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server, signInAsAnalyst } from '../test/server.js';

const paidHistory = {
  history: [
    ...f.orderHistory.history,
    {
      id: 2,
      fromStatus: 'pending',
      toStatus: 'paid',
      note: 'Bank transfer received',
      changedAt: '2026-03-01T12:00:00.000Z',
      changedBy: { id: 1, fullName: 'Ada Admin' },
    },
  ],
};

describe('order detail', () => {
  it('shows progress through the lifecycle and the activity feed', async () => {
    server.use(
      http.get(`${API}/orders/:id`, () =>
        HttpResponse.json({ order: { ...f.order, status: 'paid' } }),
      ),
      http.get(`${API}/orders/:id/history`, () => HttpResponse.json(paidHistory)),
    );
    renderApp('/orders/42');
    const progress = await screen.findByRole('list', { name: 'Order progress' });
    const steps = within(progress).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Placed (done)'),
      expect.stringContaining('Paid (current)'),
      expect.stringContaining('ShippedNot yet'),
      expect.stringContaining('DeliveredNot yet'),
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');

    const activity = screen.getByRole('list', { name: 'Order activity' });
    const entries = within(activity).getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Ada Admin placed the order');
    expect(entries[1]).toHaveTextContent('Ada Admin added a note');
    expect(entries[1]).toHaveTextContent('Customer asked for gift wrapping.');
    expect(entries[2]).toHaveTextContent('Ada Admin marked the order as paid');
    expect(entries[2]).toHaveTextContent('Bank transfer received');
    expect(screen.getByText(/Placed .* by Ada Admin\./)).toBeInTheDocument();
  });

  it('ends the progress with a cancelled step for cancelled orders', async () => {
    server.use(
      http.get(`${API}/orders/:id`, () =>
        HttpResponse.json({ order: { ...f.order, status: 'cancelled' } }),
      ),
      http.get(`${API}/orders/:id/history`, () =>
        HttpResponse.json({
          history: [
            ...paidHistory.history,
            { ...paidHistory.history[1], id: 3, fromStatus: 'paid', toStatus: 'cancelled' },
          ],
        }),
      ),
    );
    renderApp('/orders/42');
    const progress = await screen.findByRole('list', { name: 'Order progress' });
    const labels = within(progress)
      .getAllByRole('listitem')
      .map((s) => s.textContent);
    expect(labels).toEqual([
      expect.stringContaining('Placed'),
      expect.stringContaining('Paid'),
      expect.stringContaining('Cancelled (current)'),
    ]);
  });

  it('sends the optional note with a status change and refreshes the history', async () => {
    let body;
    let historyCalls = 0;
    server.use(
      http.patch(`${API}/orders/:id/status`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ order: { ...f.order, status: 'paid' } });
      }),
      http.get(`${API}/orders/:id/history`, () => {
        historyCalls += 1;
        return HttpResponse.json(f.orderHistory);
      }),
    );
    const { user } = renderApp('/orders/42');
    await user.click(await screen.findByRole('button', { name: 'Mark as paid' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark as paid?' });
    const note = within(dialog).getByLabelText('Note (optional)');
    expect(note).toHaveFocus();
    await user.type(note, 'Paid by card');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));

    expect(await screen.findByText('Order #42 is now paid.')).toBeInTheDocument();
    expect(body).toEqual({ status: 'paid', note: 'Paid by card' });
    await waitFor(() => expect(historyCalls).toBe(2));
  });

  it('adds a note', async () => {
    let posted;
    server.use(
      http.post(`${API}/orders/:id/notes`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ note: { id: 2, body: posted.body } }, { status: 201 });
      }),
    );
    const { user } = renderApp('/orders/42');
    const field = await screen.findByLabelText('Add a note');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a note first.');
    await user.type(field, '  Called the courier ');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Note added.')).toBeInTheDocument();
    expect(posted).toEqual({ body: 'Called the courier' });
    expect(field).toHaveValue('');
  });

  it('hides the note form and status actions from analysts', async () => {
    signInAsAnalyst();
    renderApp('/orders/42');
    await screen.findByRole('list', { name: 'Order activity' });
    expect(screen.queryByLabelText('Add a note')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute(
      'href',
      '/orders/42/invoice',
    );
  });
});

describe('invoice', () => {
  it('renders a printable invoice from the order and customer', async () => {
    renderApp('/orders/42/invoice');
    const invoice = await screen.findByRole('article', { name: 'Invoice INV-000042' });
    expect(within(invoice).getByText('Alice Martin')).toBeInTheDocument();
    expect(within(invoice).getByText('Lyon, France')).toBeInTheDocument();
    expect(within(invoice).getByText('Wireless Mouse')).toBeInTheDocument();
    expect(within(invoice).getByText(/1,?348\.00/)).toBeInTheDocument();
    expect(within(invoice).getByText('Awaiting payment.')).toBeInTheDocument();
    // No app shell on the printable page.
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print or save as PDF' })).toBeEnabled();
  });

  it('marks the invoice of a cancelled order as void', async () => {
    server.use(
      http.get(`${API}/orders/:id`, () =>
        HttpResponse.json({ order: { ...f.order, status: 'cancelled' } }),
      ),
    );
    renderApp('/orders/42/invoice');
    expect(
      await screen.findByText('This order was cancelled. This invoice is void.'),
    ).toBeInTheDocument();
  });
});

describe('bulk status changes', () => {
  const second = { ...f.ordersList.data[0], id: 43 };
  const twoOrders = { ...f.ordersList, data: [...f.ordersList.data, second] };

  it('changes the selected orders and reports the ones that could not change', async () => {
    let body;
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json(twoOrders)),
      http.post(`${API}/orders/bulk-status`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          status: 'paid',
          updated: [42],
          failed: [
            {
              orderId: 43,
              code: 'INVALID_STATUS_TRANSITION',
              message: 'Cannot change order status from shipped to paid',
            },
          ],
        });
      }),
    );
    const { user } = renderApp('/orders');
    await user.click(
      await screen.findByRole('checkbox', { name: 'Select all orders on this page' }),
    );
    const bar = screen.getByRole('region', { name: 'Selected orders' });
    expect(bar).toHaveTextContent('2 selected');
    await user.click(within(bar).getByRole('button', { name: 'Mark as paid' }));

    const dialog = screen.getByRole('dialog', { name: 'Mark 2 orders as paid?' });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Batch');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));

    expect(await screen.findByText('Marked 1 order as paid.')).toBeInTheDocument();
    expect(body).toEqual({ orderIds: [42, 43], status: 'paid', note: 'Batch' });
    const report = screen.getByRole('dialog', { name: '1 order not changed' });
    expect(report).toHaveTextContent('Order #43');
    expect(report).toHaveTextContent('Cannot change order status from shipped to paid');
    await user.click(within(report).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Selected orders' })).not.toBeInTheDocument();
  });

  it('selects single rows and clears the selection when filters change', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json(twoOrders)));
    const { user } = renderApp('/orders');
    await user.click(await screen.findByRole('checkbox', { name: 'Select order #43' }));
    expect(screen.getByRole('checkbox', { name: 'Select all orders on this page' })).toHaveProperty(
      'indeterminate',
      true,
    );
    await user.click(screen.getByRole('radio', { name: 'Paid' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Selected orders' })).not.toBeInTheDocument(),
    );
  });

  it('offers no selection to analysts', async () => {
    signInAsAnalyst();
    renderApp('/orders');
    await screen.findByRole('table', { name: 'Orders' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
