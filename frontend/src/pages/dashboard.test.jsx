import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server } from '../test/server.js';

const panel = (name) => screen.getByRole('region', { name });

describe('dashboard', () => {
  it('shows KPIs with change vs the previous period', async () => {
    renderApp('/');
    expect(await screen.findByText(/128\.5K/)).toBeInTheDocument(); // net revenue (hero)
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    expect(screen.getByText('1,520')).toBeInTheDocument(); // orders
    expect(screen.getByText('-3.2%')).toBeInTheDocument();
    // Cancellation rate went up, which is bad: rendered in the critical tone.
    expect(screen.getByText('+2.5%').closest('span')).toHaveClass('text-text-critical');
    expect(screen.getByText('+12.4%').closest('span')).toHaveClass('text-text-good');
    expect(screen.getAllByText('No data for previous 30 days').length).toBeGreaterThan(0);
  });

  it('renders every panel from the API', async () => {
    renderApp('/');
    expect(await screen.findByText('Aurora 14" Laptop')).toBeInTheDocument();
    expect(within(panel('Revenue by category')).getByText('Electronics')).toBeInTheDocument();
    expect(within(panel('Order status')).getByText('Delivered')).toBeInTheDocument();
    expect(within(panel('Inventory watchlist')).getByText('Wireless Mouse')).toBeInTheDocument();
    expect(within(panel('Inventory watchlist')).getByText('1 out of stock')).toBeInTheDocument();
    expect(
      within(panel('Detected anomalies')).getByText('Unusually large order'),
    ).toBeInTheDocument();
    expect(within(panel('Data pipeline health')).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel('Data pipeline health')).getByText('Spark streaming')).toBeInTheDocument();
    expect(within(panel('Customer purchasing trends')).getByText('46.9%')).toBeInTheDocument();
  });

  it('offers a table view of chart data', async () => {
    const { user } = renderApp('/');
    const revenue = await screen.findByRole('region', { name: 'Net revenue over time' });
    // The toggle appears once the panel's data has loaded.
    await user.click(await within(revenue).findByRole('radio', { name: 'Table' }));
    const table = await within(revenue).findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 days
    expect(within(table).getByText(/4,?100\.00/)).toBeInTheDocument();
  });

  it('requests data for the chosen range and keeps it in the URL', async () => {
    const seen = [];
    server.use(
      http.get(`${API}/analytics/overview`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.toString());
        return HttpResponse.json(f.overview);
      }),
    );
    const { user, router } = renderApp('/');
    await screen.findByText(/128\.5K/);
    await user.click(screen.getByRole('radio', { name: '7 days' }));

    await waitFor(() => expect(router.state.location.search).toBe('?range=7d'));
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(2));
    const last = new URLSearchParams(seen.at(-1));
    const days = (Date.parse(last.get('to')) - Date.parse(last.get('from'))) / 86_400_000 + 1;
    expect(days).toBe(7);
  });

  it('validates a custom range', async () => {
    const { user, router } = renderApp('/');
    await screen.findByText(/128\.5K/);
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    await user.clear(from);
    await user.type(from, '2026-03-10');
    await user.clear(to);
    await user.type(to, '2026-03-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('start date must be before');

    await user.clear(to);
    await user.type(to, '2026-03-20');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(router.state.location.search).toBe('?from=2026-03-10&to=2026-03-20'),
    );
  });

  it('shows helpful empty states when there is no data yet', async () => {
    const empty = { ...f.revenue, series: f.revenue.series.map((b) => ({ ...b, orders: 0 })) };
    server.use(
      http.get(`${API}/analytics/revenue`, () => HttpResponse.json(empty)),
      http.get(`${API}/analytics/products/top`, () =>
        HttpResponse.json({ ...f.topProducts, products: [] }),
      ),
      http.get(`${API}/analytics/anomalies`, () =>
        HttpResponse.json({
          ...f.anomalies,
          data: [],
          summary: { total: 0, byType: {}, bySeverity: {} },
        }),
      ),
    );
    renderApp('/');
    const revenue = await screen.findByRole('region', { name: 'Net revenue over time' });
    expect(await within(revenue).findByText(/No orders in this period/)).toBeInTheDocument();
    expect(within(panel('Best-selling products')).getByText('No data yet')).toBeInTheDocument();
    expect(
      within(panel('Detected anomalies')).getByText('No anomalies in this period'),
    ).toBeInTheDocument();
  });

  it('isolates a failing panel and recovers on retry', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/analytics/categories`, () =>
        fail
          ? HttpResponse.json(
              { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable' } },
              { status: 500 },
            )
          : HttpResponse.json(f.categories),
      ),
    );
    const { user } = renderApp('/');
    const categories = await screen.findByRole('region', { name: 'Revenue by category' });
    expect(await within(categories).findByText('Database unavailable')).toBeInTheDocument();
    // Other panels are unaffected.
    expect(await screen.findByText('Aurora 14" Laptop')).toBeInTheDocument();

    fail = false;
    await user.click(within(categories).getByRole('button', { name: /Try again/ }));
    expect(await within(categories).findByText('Electronics')).toBeInTheDocument();
  });

  it('caps meaningless percentages and avoids false stock alarms', async () => {
    server.use(
      http.get(`${API}/analytics/overview`, () =>
        HttpResponse.json({ ...f.overview, change: { ...f.overview.change, orders: 15790 } }),
      ),
      http.get(`${API}/analytics/inventory`, () =>
        HttpResponse.json({
          ...f.inventory,
          summary: { ...f.inventory.summary, lowStockProducts: 0, outOfStockProducts: 0 },
        }),
      ),
    );
    renderApp('/');
    expect(await screen.findByText('>+999%')).toBeInTheDocument();
    const inventory = await screen.findByRole('region', { name: 'Inventory watchlist' });
    expect(await within(inventory).findByText('All products well stocked')).toBeInTheDocument();
    expect(within(inventory).queryByText(/out of stock/)).not.toBeInTheDocument();
  });

  it('shows when analytics were last updated', async () => {
    server.use(
      http.get(`${API}/analytics/order-status`, () =>
        HttpResponse.json({ ...f.orderStatus, dataAsOf: null }),
      ),
    );
    renderApp('/');
    expect(
      await screen.findByText('The stream processor has not produced data yet'),
    ).toBeInTheDocument();
  });
});
