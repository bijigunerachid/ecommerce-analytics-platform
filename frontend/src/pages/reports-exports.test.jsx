import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render.jsx';
import { API, server } from '../test/server.js';

let downloads;

beforeEach(() => {
  downloads = [];
  // jsdom has no object URLs or real downloads: record what would be saved.
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    downloads.push({ href: this.href, filename: this.download });
  });
});

afterEach(() => {
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
});

function csvHandler(onRequest) {
  return http.get(`${API}/exports/:file`, ({ request, params }) => {
    onRequest?.(params.file, new URL(request.url).searchParams);
    return new HttpResponse('Order,Status\r\n42,pending\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${params.file.replace('.csv', '')}-2026-03-11.csv"`,
      },
    });
  });
}

describe('export menu', () => {
  it('downloads the list with the filters on screen', async () => {
    let requested;
    server.use(csvHandler((file, query) => (requested = { file, query: query.toString() })));
    const { user } = renderApp('/orders?status=paid&search=alice');
    await screen.findByRole('table', { name: 'Orders' });
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV for Excel' }));

    expect(await screen.findByText('Downloaded orders-2026-03-11.csv.')).toBeInTheDocument();
    expect(downloads).toEqual([{ href: 'blob:fake', filename: 'orders-2026-03-11.csv' }]);
    expect(requested.file).toBe('orders.csv');
    const query = new URLSearchParams(requested.query);
    expect(Object.fromEntries(query)).toMatchObject({
      status: 'paid',
      search: 'alice',
      format: 'excel',
    });
  });

  it('explains why an export was refused', async () => {
    server.use(
      http.get(`${API}/exports/:file`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'EXPORT_TOO_LARGE',
              message: 'This export has 120000 rows; the limit is 100000. Narrow the filters.',
            },
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/products');
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    expect(await screen.findByText(/the limit is 100000/)).toBeInTheDocument();
    expect(downloads).toEqual([]);
  });

  it('is on every list page', async () => {
    for (const path of ['/customers', '/inventory', '/audit-log']) {
      const { unmount } = renderApp(path);
      expect(await screen.findByRole('button', { name: 'Export' })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('reports', () => {
  it('shows a printable report for the selected period', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = renderApp('/reports?from=2026-02-10&to=2026-03-11');
    expect(await screen.findByRole('heading', { name: 'Sales report' })).toBeInTheDocument();
    expect(
      screen.getByText(/10 Feb 2026 to 11 Mar 2026 \(UTC\)\. Prepared by Ada Admin/),
    ).toBeInTheDocument();

    expect(await screen.findByText('Net revenue')).toBeInTheDocument();
    expect(screen.getByText('+12.4% vs previous period')).toBeInTheDocument();
    const top = await screen.findByRole('table', { name: 'Top 10 products' });
    expect(within(top).getAllByRole('row')[1]).toHaveTextContent('Aurora 14" Laptop');
    expect(await screen.findByRole('table', { name: 'Sales by day' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Orders by status' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalled();
  });

  it('downloads the report data for the same period', async () => {
    let requested;
    server.use(csvHandler((file, query) => (requested = { file, query })));
    const { user } = renderApp('/reports?from=2026-02-10&to=2026-03-11');
    await user.click(await screen.findByRole('button', { name: 'Daily sales' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(requested.file).toBe('sales-daily.csv');
    expect(requested.query.get('from')).toBe('2026-02-10');
    expect(requested.query.get('to')).toBe('2026-03-11');
  });

  it('is in the navigation for every role', async () => {
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute('href', '/reports');
  });
});
