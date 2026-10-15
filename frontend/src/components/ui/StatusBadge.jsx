import { CircleAlert, CircleCheck, CircleHelp, CircleX, TriangleAlert } from 'lucide-react';

// Status colors are reserved for state and always paired with an icon and a label.
// The text stays in ink color (readable on the tint in both themes); the icon carries the status.
const STATUS = {
  good: {
    icon: CircleCheck,
    dot: 'text-status-good',
    tint: 'bg-status-good/10 border-status-good/25',
  },
  warning: {
    icon: TriangleAlert,
    dot: 'text-status-warning',
    tint: 'bg-status-warning/12 border-status-warning/30',
  },
  serious: {
    icon: CircleAlert,
    dot: 'text-status-serious',
    tint: 'bg-status-serious/10 border-status-serious/30',
  },
  critical: {
    icon: CircleX,
    dot: 'text-status-critical',
    tint: 'bg-status-critical/10 border-status-critical/25',
  },
  unknown: { icon: CircleHelp, dot: 'text-ink-muted', tint: 'bg-surface-sunken border-line' },
};

export function StatusBadge({ status = 'unknown', label, icon }) {
  const { icon: defaultIcon, dot, tint } = STATUS[status] ?? STATUS.unknown;
  const Icon = icon ?? defaultIcon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium text-ink ${tint}`}
    >
      <Icon aria-hidden="true" className={`size-3.5 ${dot}`} />
      {label}
    </span>
  );
}
