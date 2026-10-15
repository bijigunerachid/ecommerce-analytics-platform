const VARIANTS = {
  primary:
    'bg-accent-fill text-on-accent shadow-card hover:bg-accent-fill-hover active:translate-y-px disabled:opacity-60',
  secondary:
    'border border-line-strong bg-surface-raised text-ink shadow-card hover:bg-surface-sunken active:translate-y-px disabled:opacity-60',
  ghost: 'text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:opacity-60',
  danger:
    'bg-status-critical text-white shadow-card hover:bg-status-critical/90 active:translate-y-px disabled:opacity-60',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'size-9 justify-center',
  'icon-sm': 'size-8 justify-center',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 disabled:cursor-not-allowed';

/** Button classes, also for links that look like buttons. */
export function buttonClass(variant = 'primary', size = 'md', className = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}
