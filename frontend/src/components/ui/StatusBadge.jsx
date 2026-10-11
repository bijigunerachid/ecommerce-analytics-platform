import { CircleAlert, CircleCheck, CircleHelp, CircleX, TriangleAlert } from 'lucide-react';

// Status colors are reserved for state and always paired with an icon and a label.
const STATUS = {
  good: { icon: CircleCheck, dot: 'text-status-good' },
  warning: { icon: TriangleAlert, dot: 'text-status-warning' },
  serious: { icon: CircleAlert, dot: 'text-status-serious' },
  critical: { icon: CircleX, dot: 'text-status-critical' },
  unknown: { icon: CircleHelp, dot: 'text-ink-muted' },
};

export function StatusBadge({ status = 'unknown', label, icon }) {
  const { icon: defaultIcon, dot } = STATUS[status] ?? STATUS.unknown;
  const Icon = icon ?? defaultIcon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink">
      <Icon aria-hidden="true" className={`size-3.5 ${dot}`} />
      {label}
    </span>
  );
}
