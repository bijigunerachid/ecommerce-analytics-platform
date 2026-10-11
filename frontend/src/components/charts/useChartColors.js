import { useMemo } from 'react';
import { useTheme } from '../../theme/ThemeContext.js';

const TOKENS = {
  series1: '--series-1',
  series2: '--series-2',
  grid: '--chart-grid',
  axis: '--chart-axis',
  surface: '--surface',
  ink: '--ink',
  inkSecondary: '--ink-secondary',
};

/**
 * Chart colors resolved from the CSS tokens of the active theme. SVG presentation attributes
 * (which Recharts uses) do not reliably resolve var(), so concrete values are passed instead.
 */
export function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      Object.entries(TOKENS).map(([key, cssVar]) => [key, style.getPropertyValue(cssVar).trim()]),
    );
    // `resolved` is the dependency: the class on <html> changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
}
