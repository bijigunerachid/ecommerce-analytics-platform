/**
 * A tiny trend line (no axes) for KPI tiles. Decorative: the tile states the figure and its
 * change in text, so the line is hidden from screen readers. Colored with currentColor, so it
 * follows the theme tokens through a text-* class.
 */
export function Sparkline({ values, className = 'h-10 w-full text-series-1', fill = true }) {
  const points = values.map(Number).filter((v) => Number.isFinite(v));
  if (points.length < 2) return <div aria-hidden="true" className={className} />;

  const width = 100;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points.map((v, i) => [
    (i / (points.length - 1)) * width,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const line = coords
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join('');

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
    >
      {fill && (
        <path d={`${line}L${width},${height}L0,${height}Z`} fill="currentColor" opacity="0.1" />
      )}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
