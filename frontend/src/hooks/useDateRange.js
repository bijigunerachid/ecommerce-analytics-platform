import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export const RANGE_PRESETS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
];
const DEFAULT_PRESET = '30d';
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Inclusive UTC range ending today for a preset. */
export function presetRange(presetId, today = new Date()) {
  const preset = RANGE_PRESETS.find((p) => p.id === presetId) ?? RANGE_PRESETS[1];
  const to = isoDay(today);
  const from = isoDay(new Date(today.getTime() - (preset.days - 1) * DAY_MS));
  return { from, to };
}

/**
 * The dashboard date range, stored in the URL (?range=30d or ?from=…&to=…) so a view can be
 * bookmarked and shared and survives a reload.
 */
export function useDateRange() {
  const [params, setParams] = useSearchParams();

  const value = useMemo(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to && ISO_DAY.test(from) && ISO_DAY.test(to) && from <= to) {
      return { preset: 'custom', from, to };
    }
    const preset = RANGE_PRESETS.some((p) => p.id === params.get('range'))
      ? params.get('range')
      : DEFAULT_PRESET;
    return { preset, ...presetRange(preset) };
  }, [params]);

  const setPreset = useCallback(
    (preset) => setParams({ range: preset }, { replace: true }),
    [setParams],
  );
  const setCustom = useCallback(
    (from, to) => setParams({ from, to }, { replace: true }),
    [setParams],
  );

  return { ...value, setPreset, setCustom };
}
