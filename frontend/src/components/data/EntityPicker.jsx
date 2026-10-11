import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';

/**
 * Searchable picker backed by an API list endpoint (accessible combobox pattern):
 * type to search, arrow keys to move, Enter to choose, Escape to close.
 *
 * @param {(search: string, signal: AbortSignal) => Promise<{ data: object[] }>} search
 * @param {(item: object) => string} getLabel
 * @param {(item: object) => string} [getDetail] - secondary text shown under each option
 */
export function EntityPicker({
  label,
  value,
  onChange,
  search,
  getLabel,
  getDetail,
  getDisabled,
  placeholder,
  error,
  required,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(text, 250);
  const rootRef = useRef(null);

  const query = useApiQuery(
    (signal) => (open ? search(debounced, signal) : Promise.resolve(null)),
    [debounced, open],
  );
  const options = query.data?.data ?? [];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(item) {
    if (getDisabled?.(item)) return;
    onChange(item);
    setOpen(false);
    setText('');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  const display = open ? text : value ? getLabel(value) : '';

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-text-critical">
            *
          </span>
        )}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          placeholder={placeholder}
          value={display}
          onFocus={() => setOpen(true)}
          // After choosing, focus stays here; a click must reopen the list too.
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`block h-10 w-full rounded-lg border bg-surface-raised pr-8 pl-3 text-sm text-ink placeholder:text-ink-muted ${error ? 'border-status-critical' : 'border-line-strong'}`}
        />
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute top-3 right-2.5 size-4 text-ink-muted"
        />
      </div>
      {error && <p className="mt-1 text-xs text-text-critical">{error}</p>}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface-raised py-1 shadow-lg"
        >
          {query.isLoading && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
          {!query.isLoading && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>
          )}
          {options.map((item, i) => {
            const disabled = getDisabled?.(item);
            const selected = value && getLabel(value) === getLabel(item);
            return (
              <li
                key={i}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={selected}
                aria-disabled={disabled || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm ${i === active ? 'bg-surface-sunken' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-ink">{getLabel(item)}</span>
                  {getDetail && (
                    <span className="block text-xs text-ink-muted">{getDetail(item)}</span>
                  )}
                </span>
                {selected && <Check aria-hidden="true" className="mt-0.5 size-4 text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
