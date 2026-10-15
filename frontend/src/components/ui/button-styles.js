const VARIANTS = {
  primary:
    'bg-accent-fill text-on-accent shadow-raised hover:bg-accent-fill-hover active:translate-y-px disabled:opacity-50',
  secondary:
    'border border-line-strong bg-surface-raised text-ink shadow-card hover:bg-surface-hover hover:border-line-strong active:translate-y-px disabled:opacity-50',
  ghost: 'text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:opacity-50',
  danger:
    'bg-status-critical text-white shadow-raised hover:bg-text-critical active:translate-y-px disabled:opacity-50 dark:hover:bg-status-critical/85',
  'danger-ghost': 'text-text-critical hover:bg-status-critical/10 disabled:opacity-50',
  'subtle-danger':
    'text-ink-muted hover:bg-status-critical/10 hover:text-text-critical disabled:opacity-50',
};

const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'size-9 justify-center',
  'icon-sm': 'size-8 justify-center',
  'icon-xs': 'size-7 justify-center',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:active:translate-y-0';

/** Button classes, also for links that look like buttons. */
export function buttonClass(variant = 'primary', size = 'md', className = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

/** Compact date input in filter bars (same height and focus ring as the other filters). */
export const FILTER_DATE_INPUT =
  'h-8 rounded-lg border border-line-strong bg-surface-raised px-2 text-[13px] text-ink shadow-card hover:border-ink-muted/50 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none';
