/** A keyboard key, e.g. <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>. */
export function Kbd({ children, className = '' }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-raised px-1 font-sans text-[11px] font-medium text-ink-secondary ${className}`}
    >
      {children}
    </kbd>
  );
}
