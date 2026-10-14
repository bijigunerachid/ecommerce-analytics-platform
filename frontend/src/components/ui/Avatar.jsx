import { initials } from '../../utils/text.js';

const SIZES = { sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' };

/** Initials avatar (no images: user records have no photos). Decorative next to the name. */
export function Avatar({ name, size = 'md', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-strong dark:text-ink ${SIZES[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
