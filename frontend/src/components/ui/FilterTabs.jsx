import { useRef } from 'react';

/**
 * Tab-style filter over a list (e.g. All · Pending · Paid). It selects a filter rather than
 * switching panels, so it uses radio-group semantics: one Tab stop, arrow keys move the
 * selection (Home/End jump to the ends).
 */
export function FilterTabs({ label, options, value, onChange }) {
  const listRef = useRef(null);

  function onKeyDown(e) {
    const index = options.findIndex((o) => o.value === value);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    listRef.current?.querySelectorAll('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="-mb-px flex gap-1 overflow-x-auto"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative h-10 shrink-0 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
            <span
              aria-hidden="true"
              className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${
                selected ? 'bg-accent' : 'bg-transparent'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
