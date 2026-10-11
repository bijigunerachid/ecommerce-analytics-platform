import { useId } from 'react';

const CONTROL =
  'block w-full rounded-lg border bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted disabled:opacity-60';

function controlClass(error, extra = '') {
  return `${CONTROL} ${error ? 'border-status-critical' : 'border-line-strong'} ${extra}`;
}

/**
 * Label + control + hint/error, wired for screen readers (aria-invalid, aria-describedby).
 * `render` receives the props to spread on the control.
 */
function FieldShell({ label, hint, error, required, className = '', render }) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-text-critical">
            *
          </span>
        )}
      </label>
      <div className="mt-1">
        {render({
          id,
          'aria-invalid': Boolean(error),
          'aria-describedby': describedBy || undefined,
          'aria-required': required || undefined,
        })}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, required, className, ...inputProps }) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      render={(a11y) => <input {...a11y} {...inputProps} className={controlClass(error, 'h-10')} />}
    />
  );
}

export function TextAreaField({ label, hint, error, required, className, ...props }) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      render={(a11y) => (
        <textarea {...a11y} rows={3} {...props} className={controlClass(error, 'py-2')} />
      )}
    />
  );
}

export function SelectField({ label, hint, error, required, className, options, ...props }) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      render={(a11y) => (
        <select {...a11y} {...props} className={controlClass(error, 'h-10 pr-8')}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    />
  );
}

export function CheckboxField({ label, hint, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-line-strong accent-[var(--accent)]"
        {...props}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** Compact select used in filter bars (label visually hidden). */
export function FilterSelect({ label, options, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        {...props}
        className="h-9 rounded-lg border border-line-strong bg-surface-raised px-2 pr-7 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A form-level error banner. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink"
    >
      {children}
    </div>
  );
}
