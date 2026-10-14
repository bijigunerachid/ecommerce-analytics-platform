import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

const PLACEMENT = {
  end: 'top-full right-0 mt-2',
  start: 'top-full left-0 mt-2',
  'top-start': 'bottom-full left-0 mb-2',
};

/**
 * Dropdown menu (WAI-ARIA menu button): the trigger toggles it, arrow keys move between items,
 * Escape or Tab closes it, and focus returns to the trigger. Clicking outside closes it.
 *
 * `trigger` receives the props to spread on the trigger button.
 * `items`: { label, icon?, onSelect, checked?, danger? } or { type: 'separator' } or
 * { type: 'label', label }.
 */
export function Menu({ trigger, items, align = 'end', label, header, className = '' }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector('[role^="menuitem"]')?.focus();
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onKeyDown(e) {
    const entries = [...(listRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      entries[e.key === 'Home' ? 0 : entries.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={`animate-pop-in absolute z-50 min-w-56 rounded-xl border border-line bg-surface-raised p-1 shadow-pop ${PLACEMENT[align]}`}
        >
          {header}
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <div key={i} role="separator" className="my-1 h-px bg-line" />;
            }
            if (item.type === 'label') {
              return (
                <p key={i} className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-ink-muted">
                  {item.label}
                </p>
              );
            }
            const Icon = item.icon;
            const isRadio = item.checked !== undefined;
            return (
              <button
                key={i}
                type="button"
                role={isRadio ? 'menuitemradio' : 'menuitem'}
                aria-checked={isRadio ? item.checked : undefined}
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none ${
                  item.danger ? 'text-text-critical' : 'text-ink'
                }`}
              >
                {Icon && <Icon aria-hidden="true" className="size-4 text-ink-muted" />}
                <span className="flex-1">{item.label}</span>
                {item.checked && <Check aria-hidden="true" className="size-4 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
