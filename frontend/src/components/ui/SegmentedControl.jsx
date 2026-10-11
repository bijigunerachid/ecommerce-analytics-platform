/**
 * A small group of mutually exclusive options (radio semantics).
 * Icon-only options must pass `ariaLabel`: icons are aria-hidden and give the button no name.
 */
export function SegmentedControl({ label, options, value, onChange, size = 'sm' }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface-sunken p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            title={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={`rounded-md font-medium transition-colors ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            } ${
              selected
                ? 'bg-surface-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
