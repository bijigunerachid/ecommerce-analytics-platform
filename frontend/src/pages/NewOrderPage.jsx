import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { customersApi, ordersApi, productsApi } from '../api/endpoints.js';
import { EntityPicker } from '../components/data/EntityPicker.jsx';
import { PageHeader } from '../components/data/ResourceTable.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import { FormError } from '../components/ui/Field.jsx';
import { useToast } from '../components/ui/toast-context.js';
import { errorMessage } from '../utils/errors.js';
import { formatMoney, formatNumber } from '../utils/format.js';

const toCents = (amount) => Math.round(Number(amount) * 100);

/**
 * Creates an order. The idempotency key is generated once per order attempt and reused if the
 * request is retried (e.g. after a network error), so a retry can never create a second order
 * or deduct stock twice. Prices shown here are an estimate; the server computes the real total.
 */
export function NewOrderPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState(null);
  const [lines, setLines] = useState([]); // { product, quantity }
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState({});
  const [lineErrors, setLineErrors] = useState({}); // productId → message
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Any change to the order makes it a different request, which needs a new key.
  function changed() {
    setIdempotencyKey(crypto.randomUUID());
    setFormError(null);
  }

  function addProduct(product) {
    setLines((current) =>
      current.some((l) => l.product.id === product.id)
        ? current.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...current, { product, quantity: 1 }],
    );
    setErrors((e) => ({ ...e, items: undefined }));
    changed();
  }

  // The field may be empty while the user retypes it; it is normalized on blur.
  function setQuantity(productId, value) {
    const quantity =
      value === '' ? '' : Math.min(10_000, Math.max(0, Number.parseInt(value, 10) || 0));
    setLines((current) =>
      current.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    );
    setLineErrors((e) => ({ ...e, [productId]: undefined }));
    changed();
  }

  function normalizeQuantity(productId) {
    setLines((current) =>
      current.map((l) =>
        l.product.id === productId && !(l.quantity >= 1) ? { ...l, quantity: 1 } : l,
      ),
    );
  }

  function removeLine(productId) {
    setLines((current) => current.filter((l) => l.product.id !== productId));
    changed();
  }

  const estimateCents = lines.reduce(
    (sum, l) => sum + toCents(l.product.price) * (Number(l.quantity) || 0),
    0,
  );

  async function submit(e) {
    e.preventDefault();
    const clientErrors = {
      customer: customer ? undefined : 'Choose a customer.',
      items: lines.length ? undefined : 'Add at least one product.',
    };
    const badLines = lines.filter((l) => !(l.quantity >= 1));
    if (badLines.length) {
      setLineErrors(
        Object.fromEntries(badLines.map((l) => [l.product.id, 'Enter a quantity of at least 1.'])),
      );
    }
    setErrors(clientErrors);
    if (clientErrors.customer || clientErrors.items || badLines.length) return;

    setSubmitting(true);
    setFormError(null);
    setLineErrors({});
    try {
      const { order } = await ordersApi.create(
        {
          customerId: customer.id,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        },
        idempotencyKey,
      );
      toast.success(`Order #${order.id} created: ${formatMoney(order.totalAmount)}.`);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STOCK' && Array.isArray(err.details)) {
        setLineErrors(
          Object.fromEntries(
            err.details.map((d) => [d.productId, `Only ${formatNumber(d.available)} in stock.`]),
          ),
        );
        setFormError('Some products do not have enough stock. Reduce the highlighted quantities.');
      } else if (err.code === 'PRODUCT_UNAVAILABLE' && Array.isArray(err.details)) {
        setLineErrors(
          Object.fromEntries(err.details.map((d) => [d.productId, 'No longer available.'])),
        );
        setFormError('Some products are inactive and cannot be ordered.');
      } else if (err.code === 'NETWORK_ERROR') {
        // Keep the same key: retrying is safe even if the first attempt reached the server.
        setFormError(
          `${err.message} We couldn't confirm whether the order was placed. Submitting again without changes is safe: it will not create a duplicate.`,
        );
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All orders
      </Link>
      <PageHeader title="New order" description="Stock is reserved when the order is placed." />
      <FormError>{formError}</FormError>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Customer" />
            <div className="px-5 pt-3 pb-4">
              <EntityPicker
                label="Customer"
                required
                placeholder="Search by name or email"
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setErrors((e) => ({ ...e, customer: undefined }));
                  changed();
                }}
                error={errors.customer}
                search={(search, signal) => customersApi.list({ search, pageSize: 8 }, { signal })}
                getLabel={(c) => `${c.firstName} ${c.lastName}`}
                getDetail={(c) => c.email}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Products"
              description="Inactive and out-of-stock products cannot be added."
            />
            <div className="space-y-4 px-5 pt-3 pb-4">
              <EntityPicker
                label="Add product"
                placeholder="Search by name or SKU"
                value={null}
                onChange={addProduct}
                error={errors.items}
                search={(search, signal) =>
                  productsApi.list({ search, pageSize: 8, isActive: true }, { signal })
                }
                getLabel={(p) => p.name}
                getDetail={(p) =>
                  `${p.sku} · ${formatMoney(p.price)} · ${formatNumber(p.stockQuantity)} in stock`
                }
                getDisabled={(p) => p.stockQuantity === 0}
              />
              {lines.length > 0 && (
                <ul className="divide-y divide-line" aria-label="Order lines">
                  {lines.map(({ product, quantity }) => {
                    const lineError = lineErrors[product.id];
                    return (
                      <li key={product.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{product.name}</p>
                          <p className="text-xs text-ink-muted">
                            {product.sku} · {formatMoney(product.price)} each ·{' '}
                            {formatNumber(product.stockQuantity)} in stock
                          </p>
                          {lineError && (
                            <p className="mt-1 text-xs text-text-critical">{lineError}</p>
                          )}
                        </div>
                        <label className="sr-only" htmlFor={`qty-${product.id}`}>
                          Quantity of {product.name}
                        </label>
                        <input
                          id={`qty-${product.id}`}
                          type="number"
                          min={1}
                          max={10000}
                          value={quantity}
                          onChange={(e) => setQuantity(product.id, e.target.value)}
                          onBlur={() => normalizeQuantity(product.id)}
                          aria-invalid={Boolean(lineError)}
                          className={`h-9 w-20 rounded-lg border bg-surface-raised px-2 text-right text-sm text-ink tabular ${lineError ? 'border-status-critical' : 'border-line-strong'}`}
                        />
                        <span className="w-24 text-right text-sm text-ink tabular">
                          {formatMoney((toCents(product.price) * (Number(quantity) || 0)) / 100)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${product.name}`}
                          onClick={() => removeLine(product.id)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Summary" />
          <div className="space-y-3 px-5 pt-3 pb-4 text-sm">
            <p className="flex justify-between">
              <span className="text-ink-secondary">Lines</span>
              <span className="tabular">{lines.length}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-ink-secondary">Estimated total</span>
              <span className="font-semibold text-ink tabular">
                {formatMoney(estimateCents / 100)}
              </span>
            </p>
            <p className="text-xs text-ink-muted">
              The final total is calculated by the server from current prices.
            </p>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Placing order…' : 'Place order'}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
