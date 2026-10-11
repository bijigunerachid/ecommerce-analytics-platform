import { CreditCard, Truck } from 'lucide-react';
import { ORDER_STATUS_LABELS } from '../../utils/labels.js';
import { StatusBadge } from './StatusBadge.jsx';

/** Neutral pill for non-status labels (category, role, reason). */
export function Badge({ children }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-secondary">
      {children}
    </span>
  );
}

// In-progress states are neutral (not good or bad) but get a meaningful icon.
const ORDER_STATUS_STYLE = {
  pending: { tone: 'warning' },
  paid: { tone: 'unknown', icon: CreditCard },
  shipped: { tone: 'unknown', icon: Truck },
  delivered: { tone: 'good' },
  cancelled: { tone: 'critical' },
};

export function OrderStatusBadge({ status }) {
  return (
    <StatusBadge
      status={ORDER_STATUS_STYLE[status]?.tone ?? 'unknown'}
      icon={ORDER_STATUS_STYLE[status]?.icon}
      label={ORDER_STATUS_LABELS[status] ?? status}
    />
  );
}

export function ActiveBadge({ active }) {
  return active ? (
    <StatusBadge status="good" label="Active" />
  ) : (
    <StatusBadge status="unknown" label="Inactive" />
  );
}
