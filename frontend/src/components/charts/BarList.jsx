/**
 * Ranked horizontal bars in plain HTML, for categories with long names (products, categories,
 * statuses). One hue: the bars encode magnitude, the labels carry identity. Each bar has its
 * value at the tip, so nothing depends on hover.
 * Bars are 12px thick with a 4px rounded data-end and a square baseline.
 */
export function BarList({ items, formatValue, formatSecondary, label }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ol aria-label={label} className="space-y-3">
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <li key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-ink" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 tabular">
                <span className="font-semibold text-ink">{formatValue(item.value, item)}</span>
                {formatSecondary && (
                  <span className="ml-1.5 text-ink-muted">{formatSecondary(item)}</span>
                )}
              </span>
            </div>
            <div className="h-3 w-full rounded-r-sm bg-surface-sunken">
              <div
                className="h-3 rounded-r-[4px] bg-series-1"
                style={{ width: `${Math.max(pct, item.value > 0 ? 1 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
