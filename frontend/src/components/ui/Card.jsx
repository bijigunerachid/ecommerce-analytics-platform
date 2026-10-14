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
export function CardHeader({ title, description, actions, titleId }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
