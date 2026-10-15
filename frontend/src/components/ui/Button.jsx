import { LoaderCircle } from 'lucide-react';
import { buttonClass } from './button-styles.js';
import { Tooltip } from './Tooltip.jsx';

/**
 * Button. `loading` shows a spinner, marks the button busy, and disables it, so a request
 * cannot be sent twice; the label stays so the button keeps its size and name.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}

/**
 * Icon-only button: `label` is its accessible name and its tooltip, so an icon button can never
 * be unnamed.
 */
export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'icon',
  tooltipSide,
  className = '',
  ...props
}) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        type="button"
        aria-label={label}
        className={buttonClass(variant, size, className)}
        {...props}
      >
        <Icon aria-hidden="true" className={size === 'icon-xs' ? 'size-3.5' : 'size-4'} />
      </button>
    </Tooltip>
  );
}
