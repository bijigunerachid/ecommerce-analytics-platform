const VARIANTS = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-60 dark:hover:bg-accent/85',
  secondary:
    'border border-line-strong bg-surface-raised text-ink hover:bg-surface-sunken disabled:opacity-60',
  ghost: 'text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:opacity-60',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'size-9 justify-center',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
