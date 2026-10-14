import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import * as f from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';
import { API, server } from '../test/server.js';

const RUN = { computedAt: '2026-03-30T12:05:00.000Z', asOf: '2026-03-30', lastError: null };
const EMPTY_RUN = { computedAt: null, asOf: null, lastError: null };
const NAMES = ['champions', 'loyal', 'promising', 'needs_attention', 'at_risk', 'hibernating'];

const segments = {
  run: RUN,
  totalCustomers: 10,
  totalRevenue: '5000.00',
  segments: NAMES.map((segment, i) => ({
    segment,
    customers: i === 0 ? 4 : i === 5 ? 6 : 0,
    customerShare: i === 0 ? 40 : i === 5 ? 60 : 0,
    revenue: i === 0 ? '4000.00' : i === 5 ? '1000.00' : '0.00',
    revenueShare: i === 0 ? 80 : i === 5 ? 20 : 0,
    avgRecencyDays: i === 0 ? 3 : i === 5 ? 70 : null,
    avgOrders: i === 0 ? 5 : i === 5 ? 1 : null,
    avgSpend: null,
  })),
};

const cohorts = {
  run: RUN,
  weeks: 10,
  cohorts: [
    {
      cohortWeek: '2026-03-02',
      size: 40,
      retention: [
        { weekOffset: 0, active: 40, rate: 100 },
        { weekOffset: 1, active: 10, rate: 25 },
      ],
    },
  ],
};

const forecast = {
  run: RUN,
  model: {
    name: 'Weekday-adjusted 28-day moving average',
    trainingDays: 60,
    backtestWape: 0.1834,
    skipped: null,
  },
  actual: [
    { day: '2026-03-28', revenue: '900.00' },
    { day: '2026-03-29', revenue: '1150.00' },
  ],
  forecast: [{ day: '2026-03-30', forecast: '1000.00', lower: '800.00', upper: '1250.00' }],
};

function mockInsights({ seg = segments, coh = cohorts, fc = forecast } = {}) {
  server.use(
    http.get(`${API}/analytics/segments`, () => HttpResponse.json(seg)),
    http.get(`${API}/analytics/cohorts`, () => HttpResponse.json(coh)),
    http.get(`${API}/analytics/forecast`, () => HttpResponse.json(fc)),
  );
}

describe('insights page', () => {
  it('shows the forecast with its accuracy, segments, and repeat purchases', async () => {
    mockInsights();
    const { user } = renderApp('/insights');
    expect(await screen.findByText(/Computed by Spark/)).toBeInTheDocument();

    const forecastPanel = await screen.findByRole('region', { name: 'Sales forecast' });
    expect(
      within(forecastPanel).getByText(/daily forecasts were off by 18\.3% on average/),
    ).toBeInTheDocument();
    await user.click(within(forecastPanel).getByRole('radio', { name: 'Table' }));
    const rows = within(forecastPanel).getAllByRole('row');
    expect(rows.at(-1)).toHaveTextContent(/Forecast.*1,?000\.00.*800\.00 to .*1,?250\.00/);

    const segmentsPanel = screen.getByRole('region', { name: 'Customer segments' });
    const bars = within(segmentsPanel).getByRole('list', { name: 'Customers per segment' });
    expect(within(bars).getAllByRole('listitem')[0]).toHaveTextContent('Champions');
    expect(within(segmentsPanel).getByRole('button', { name: /Loyal/ })).toBeDisabled();

    const cohortTable = screen.getByRole('table', { name: 'Repeat purchases by first-order week' });
    const cohortRow = within(cohortTable).getAllByRole('row')[1];
    expect(cohortRow).toHaveTextContent('40');
    expect(within(cohortRow).getByText('25%')).toHaveAttribute('title', '10 of 40 customers');
  });

  it('lists the customers of a segment with links to their pages', async () => {
    mockInsights();
    server.use(
      http.get(`${API}/analytics/segments/:segment/customers`, ({ params }) =>
        HttpResponse.json({
          data: [
            {
              customerId: 5,
              name: 'Alice Martin',
              email: 'alice@example.com',
              recencyDays: 2,
              frequency: 6,
              monetary: '900.00',
              scores: { r: 5, f: 5, m: 5 },
              lastOrderAt: '2026-03-28T10:00:00.000Z',
              segment: params.segment,
            },
          ],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      ),
    );
    const { user } = renderApp('/insights');
    const panel = await screen.findByRole('region', { name: 'Customer segments' });
    await user.click(within(panel).getByRole('button', { name: /Champions/ }));
    const dialog = screen.getByRole('dialog', { name: 'Champions' });
    const link = await within(dialog).findByRole('link', { name: 'Alice Martin' });
    expect(link).toHaveAttribute('href', '/customers/5');
    expect(within(dialog).getByText('5 / 5 / 5')).toBeInTheDocument();
  });

  it('explains what is missing before the first run', async () => {
    mockInsights({
      seg: { ...segments, run: EMPTY_RUN, totalCustomers: 0 },
      coh: { run: EMPTY_RUN, weeks: 10, cohorts: [] },
      fc: {
        ...forecast,
        run: EMPTY_RUN,
        forecast: [],
        model: { ...forecast.model, skipped: 'needs 42 days of history, has 10' },
      },
    });
    renderApp('/insights');
    expect(await screen.findByText(/Not computed yet/)).toBeInTheDocument();
    expect(
      await screen.findByText('The forecast needs 42 days of history, has 10.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No segments yet')).toBeInTheDocument();
    expect(await screen.findByText('No cohorts yet')).toBeInTheDocument();
  });

  it('warns when the latest run failed but keeps the last results', async () => {
    mockInsights({
      seg: {
        ...segments,
        run: {
          ...RUN,
          lastError: { at: '2026-03-30T12:35:00.000Z', message: 'Spark ran out of memory' },
        },
      },
    });
    renderApp('/insights');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /latest run failed .*Spark ran out of memory\. Showing the last successful results\./,
    );
  });

  it('shows the value segment on the customer page', async () => {
    server.use(
      http.get(`${API}/customers/:id/insights`, () =>
        HttpResponse.json({
          insights: {
            ...f.customerInsights.insights,
            valueSegment: { segment: 'at_risk', scores: { r: 2, f: 4, m: 4 }, recencyDays: 75 },
          },
        }),
      ),
    );
    renderApp('/customers/5');
    const badge = await screen.findByRole('link', { name: 'At risk' });
    expect(badge).toHaveAttribute('href', '/insights');
    expect(badge).toHaveAttribute('title', expect.stringContaining('RFM scores 2/4/4'));
  });

  it('is in the navigation', async () => {
    const { user, router } = renderApp('/');
    mockInsights();
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await user.click(within(nav).getByRole('link', { name: 'Insights' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/insights'));
  });
});
