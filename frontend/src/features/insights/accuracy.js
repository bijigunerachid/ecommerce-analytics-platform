import { formatPercent } from '../../utils/format.js';

/** How far off the backtest was, in words. */
export function accuracyText(wape) {
  if (wape === null || wape === undefined) return null;
  return `Tested on the last 14 known days, daily forecasts were off by ${formatPercent(
    wape * 100,
  )} on average (WAPE).`;
}
