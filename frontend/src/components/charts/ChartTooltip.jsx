/**
 * Tooltip content for Recharts. Values lead (strong ink), series names follow (secondary),
 * each keyed by a short line in the series color. Text never takes the series color.
 */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink-secondary">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-0.5 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-semibold text-ink tabular">
              {valueFormatter ? valueFormatter(entry.value, entry.dataKey) : entry.value}
            </span>
            <span className="text-ink-secondary">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
