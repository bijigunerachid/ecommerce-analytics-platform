export function Card({ className = '', children, ...props }) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-card ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

/** Card header: title, optional description, and right-aligned actions. */
export function CardHeader({ title, description, actions, titleId, divider = false }) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-4.5 ${
        divider ? 'border-b border-line pb-4' : ''
      }`}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Card footer: secondary information or actions, separated from the content. */
export function CardFooter({ children, className = '' }) {
  return (
    <footer
      className={`flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-line bg-surface-sunken/50 px-5 py-3 text-xs text-ink-muted ${className}`}
    >
      {children}
    </footer>
  );
}
