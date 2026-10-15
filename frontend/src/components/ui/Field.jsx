import { ChevronDown, CircleAlert } from 'lucide-react';
import { useId } from 'react';

const CONTROL =
  'block w-full rounded-lg border bg-surface-raised text-sm text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-ink-muted hover:border-ink-muted/50 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-70';

function controlClass(error, extra = '') {
  return `${CONTROL} ${error ? 'border-status-critical focus:border-status-critical focus:ring-status-critical/20' : 'border-line-strong'} ${extra}`;
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
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-text-critical">
            *
          </span>
        )}
      </label>
      <div className="mt-1.5">
        {render({
          id,
          'aria-invalid': Boolean(error),
          'aria-describedby': describedBy || undefined,
          'aria-required': required || undefined,
        })}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1 text-xs text-text-critical">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Text input. `prefix` / `suffix` show fixed text inside the field, e.g. a currency sign. */
export function TextField({
  label,
  hint,
  error,
  required,
  className,
  prefix,
  suffix,
  ...inputProps
}) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      render={(a11y) =>
        prefix || suffix ? (
          <div className="relative">
            {prefix && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted"
              >
                {prefix}
              </span>
            )}
            <input
              {...a11y}
              {...inputProps}
              className={controlClass(
                error,
                `h-9 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-10' : 'pr-3'}`,
              )}
            />
            {suffix && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted"
              >
                {suffix}
              </span>
            )}
          </div>
        ) : (
          <input {...a11y} {...inputProps} className={controlClass(error, 'h-9 px-3')} />
        )
      }
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
        <textarea
          {...a11y}
          rows={3}
          {...props}
          className={controlClass(error, 'min-h-20 px-3 py-2 leading-relaxed')}
        />
      )}
    />
  );
}

/** A native select (keyboard and screen-reader behavior for free) with a consistent chevron. */
function Select({ className = '', children, ...props }) {
  return (
    <div className="relative">
      <select {...props} className={`appearance-none ${className}`}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
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
        <Select {...a11y} {...props} className={controlClass(error, 'h-9 pr-9 pl-3')}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    />
  );
}

export function CheckboxField({ label, hint, className = '', ...props }) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
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
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * On/off setting (role="switch"). Same props as a checkbox: `checked`, `onChange` (called with
 * a change-like event so form helpers work unchanged), `disabled`.
 */
export function SwitchField({ label, hint, checked, onChange, disabled, className = '' }) {
  const id = useId();
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() =>
          onChange?.({ target: { type: 'checkbox', checked: !checked, value: !checked } })
        }
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'border-accent-fill bg-accent-fill' : 'border-line-strong bg-surface-sunken'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-4 rounded-full bg-white shadow-raised transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
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
      <Select
        id={id}
        {...props}
        className={`h-8 rounded-lg border bg-surface-raised pr-8 pl-2.5 text-[13px] text-ink shadow-card hover:border-ink-muted/50 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none ${
          props.value ? 'border-accent/60 font-medium' : 'border-line-strong'
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Groups related fields under a heading, e.g. "Pricing" and "Stock" in a product form. */
export function FormSection({ title, description, children }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden="true">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** A form-level error banner. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-status-critical/30 bg-status-critical/8 px-3 py-2.5 text-sm text-ink"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-critical" />
      <div>{children}</div>
    </div>
  );
}
