import {
  ArrowRight,
  CornerDownLeft,
  LoaderCircle,
  Monitor,
  Moon,
  Package,
  Plus,
  ReceiptText,
  Search,
  Sun,
  User,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { customersApi, ordersApi, productsApi } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { Kbd } from '../../components/ui/Kbd.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { visibleNavGroups } from '../../layouts/navigation.js';
import { useTheme } from '../../theme/ThemeContext.js';
import { formatMoney } from '../../utils/format.js';

const MIN_SEARCH = 2;

function matches(text, query) {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

/** Searches orders, products, and customers (5 each) once the query is long enough. */
function useRecordSearch(query) {
  const debounced = useDebouncedValue(query.trim(), 200);
  const active = debounced.length >= MIN_SEARCH;
  const [result, setResult] = useState({ query: null, groups: [] });

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const params = { search: debounced, pageSize: 5 };
    Promise.allSettled([
      ordersApi.list({ ...params, sort: 'createdAt', order: 'desc' }, options),
      productsApi.list(params, options),
      customersApi.list(params, options),
    ]).then(([orders, products, customers]) => {
      if (controller.signal.aborted) return;
      const rows = (r) => (r.status === 'fulfilled' ? r.value.data : []);
      setResult({
        query: debounced,
        groups: [
          {
            label: 'Orders',
            items: rows(orders).map((o) => ({
              id: `order-${o.id}`,
              icon: ReceiptText,
              label: `Order #${o.id}`,
              hint: `${o.customerName} · ${formatMoney(o.totalAmount)}`,
              to: `/orders/${o.id}`,
            })),
          },
          {
            label: 'Products',
            items: rows(products).map((p) => ({
              id: `product-${p.id}`,
              icon: Package,
              label: p.name,
              hint: `${p.sku} · ${formatMoney(p.price)}`,
              to: `/products?search=${encodeURIComponent(p.sku)}`,
            })),
          },
          {
            label: 'Customers',
            items: rows(customers).map((c) => ({
              id: `customer-${c.id}`,
              icon: User,
              label: `${c.firstName} ${c.lastName}`,
              hint: c.email,
              to: `/customers?search=${encodeURIComponent(c.email)}`,
            })),
          },
        ].filter((g) => g.items.length > 0),
      });
    });
    return () => controller.abort();
  }, [active, debounced]);

  const current = active && result.query === debounced;
  return {
    groups: current ? result.groups : [],
    searching: query.trim().length >= MIN_SEARCH && !current,
  };
}

/**
 * Command palette (Ctrl/⌘ K): jump to any page, run quick actions, or find an order, product,
 * or customer. A combobox with a listbox of options (aria-activedescendant), so screen readers
 * announce the highlighted option while focus stays in the input.
 */
export function CommandPalette({ open, onClose }) {
  if (!open) return null;
  return createPortal(<PaletteDialog onClose={onClose} />, document.body);
}

function PaletteDialog({ onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const records = useRecordSearch(query);

  useEffect(() => {
    const opener = document.activeElement;
    inputRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const groups = useMemo(() => {
    const pages = visibleNavGroups(user?.role).flatMap((g) =>
      g.items.map((i) => ({
        id: `page-${i.to}`,
        icon: i.icon,
        label: i.label,
        hint: g.label,
        to: i.to,
      })),
    );
    const actions = [
      user?.role === 'admin' && {
        id: 'new-order',
        icon: Plus,
        label: 'Create order',
        to: '/orders/new',
      },
      { id: 'theme-light', icon: Sun, label: 'Use light theme', run: () => setTheme('light') },
      { id: 'theme-dark', icon: Moon, label: 'Use dark theme', run: () => setTheme('dark') },
      {
        id: 'theme-system',
        icon: Monitor,
        label: 'Use system theme',
        run: () => setTheme('system'),
      },
    ].filter(Boolean);
    const filter = (items) => (query.trim() ? items.filter((i) => matches(i.label, query)) : items);
    return [
      { label: 'Pages', items: filter(pages) },
      { label: 'Actions', items: filter(actions) },
      ...records.groups,
    ].filter((g) => g.items.length > 0);
  }, [user?.role, setTheme, query, records.groups]);

  const flat = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeItem = flat[activeIndex];

  function run(item) {
    onClose();
    if (item.run) item.run();
    else navigate(item.to);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + flat.length) % flat.length);
    } else if (e.key === 'Enter' && activeItem) {
      e.preventDefault();
      run(activeItem);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    if (activeItem)
      document.getElementById(`cmd-${activeItem.id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeItem]);

  let index = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          {records.searching ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4.5 shrink-0 animate-spin text-ink-muted motion-reduce:animate-none"
            />
          ) : (
            <Search aria-hidden="true" className="size-4.5 shrink-0 text-ink-muted" />
          )}
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `cmd-${activeItem.id}` : undefined}
            aria-label="Search pages, actions, orders, products, and customers"
            placeholder="Search or jump to…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
        >
          {flat.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-ink-muted">
              {records.searching ? 'Searching…' : `No results for “${query.trim()}”`}
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                index += 1;
                const selected = index === activeIndex;
                const Icon = item.icon;
                const itemIndex = index;
                return (
                  <div
                    key={item.id}
                    id={`cmd-${item.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => !selected && setActive(itemIndex)}
                    onClick={() => run(item)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      selected ? 'bg-accent-soft/60 text-ink dark:bg-accent-soft/70' : 'text-ink'
                    }`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
                      <Icon aria-hidden="true" className="size-3.5 text-ink-secondary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.hint && (
                        <span className="block truncate text-xs text-ink-muted">{item.hint}</span>
                      )}
                    </span>
                    {selected && (
                      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="flex items-center gap-4 border-t border-line bg-surface px-4 py-2 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft aria-hidden="true" className="size-3" />
            </Kbd>
            to open
          </span>
          <span className="ml-auto">Type 2+ characters to search records</span>
        </footer>
      </div>
    </div>
  );
}
