import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { customersApi, ordersApi } from '../api/endpoints.js';
import { Button } from '../components/ui/Button.jsx';
import { QueryState } from '../components/ui/States.jsx';
import { useApiQuery } from '../hooks/useApiQuery.js';
import { CURRENCY, formatDay, formatMoney, formatNumber } from '../utils/format.js';
import { STORE_NAME, invoiceNumber } from '../utils/invoice.js';

function paymentNote(order) {
  if (order.status === 'cancelled') {
    return { tone: 'critical', text: 'This order was cancelled. This invoice is void.' };
  }
  if (order.status === 'pending') return { tone: 'neutral', text: 'Awaiting payment.' };
  return { tone: 'neutral', text: 'Paid in full.' };
}

function Invoice({ order, customer }) {
  const note = paymentNote(order);
  const place = [customer?.city, customer?.country].filter(Boolean).join(', ');
  return (
    <article
      aria-label={`Invoice ${invoiceNumber(order.id)}`}
      className="mx-auto w-full max-w-3xl rounded-2xl border border-line bg-surface-raised p-8 shadow-card sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-8">
        <p className="text-lg font-semibold text-ink">{STORE_NAME}</p>
        <div className="text-right">
          <h1 className="text-sm font-medium text-ink-secondary">Invoice</h1>
          <p className="text-3xl font-semibold tracking-tight text-ink tabular">
            {invoiceNumber(order.id)}
          </p>
        </div>
      </header>

      <dl className="grid gap-6 py-8 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Billed to</dt>
          <dd className="mt-1 text-ink">
            <span className="block font-medium">{order.customerName}</span>
            <span className="block">{order.customerEmail}</span>
            {place && <span className="block">{place}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Issued</dt>
          <dd className="mt-1 text-ink">{formatDay(order.createdAt.slice(0, 10))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Order</dt>
          <dd className="mt-1 text-ink">#{order.id}</dd>
        </div>
      </dl>

      <table className="w-full text-sm">
        <caption className="sr-only">Invoice lines</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            <th scope="col" className="py-2 font-medium">
              Item
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Qty
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Unit price
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {order.items.map((item) => (
            <tr key={item.productId}>
              <td className="py-3 pr-4">
                <span className="block text-ink">{item.productName}</span>
                <span className="block font-mono text-xs text-ink-muted">{item.sku}</span>
              </td>
              <td className="py-3 text-right text-ink tabular">{formatNumber(item.quantity)}</td>
              <td className="py-3 text-right text-ink tabular">{formatMoney(item.unitPrice)}</td>
              <td className="py-3 text-right text-ink tabular">{formatMoney(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink">
            <th scope="row" colSpan={3} className="pt-4 text-right font-medium text-ink">
              Total ({CURRENCY})
            </th>
            <td className="pt-4 text-right text-xl font-semibold text-ink tabular">
              {formatMoney(order.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p
        className={`mt-10 rounded-lg px-4 py-3 text-sm ${
          note.tone === 'critical'
            ? 'border border-status-critical/40 bg-status-critical/10 text-ink'
            : 'bg-surface-sunken text-ink-secondary'
        }`}
      >
        {note.text}
      </p>
    </article>
  );
}

/** A printable invoice for one order (Print / Save as PDF from the browser). */
export function InvoicePage() {
  const { id } = useParams();
  const query = useApiQuery(
    async (signal) => {
      const { order } = await ordersApi.get(id, { signal });
      // The address is optional on the invoice; a failed lookup should not block printing.
      const customer = await customersApi
        .get(order.customerId, { signal })
        .then((r) => r.customer)
        .catch(() => null);
      return { order, customer };
    },
    [id],
  );

  return (
    <div className="min-h-dvh bg-page px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/orders/${id}`}
          className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to order #{id}
        </Link>
        <Button onClick={() => window.print()} disabled={!query.data}>
          <Printer aria-hidden="true" className="size-4" /> Print or save as PDF
        </Button>
      </div>
      <QueryState query={query} height="h-96">
        {({ order, customer }) => <Invoice order={order} customer={customer} />}
      </QueryState>
    </div>
  );
}
