"""Daily net revenue forecast: a weekday-adjusted moving average.

Deliberately simple and explainable, which suits a few months of history:

    forecast(day) = level x weekday_factor[weekday(day)]

- level: average daily revenue over the last LEVEL_DAYS days.
- weekday_factor: average revenue on that weekday over the last SEASON_DAYS days, divided by the
  overall average of that period (1.0 = an average day). Factors are shrunk halfway towards 1.0
  so that a couple of unusual days cannot dominate.
- Interval: the model is replayed over the recent past (each day predicted from the days before
  it); the 10th and 90th percentiles of the relative errors give an 80% interval.
- Accuracy: a backtest fits the model without the last BACKTEST_DAYS days and predicts them.
  WAPE (sum of absolute errors / sum of actuals) is reported; unlike MAPE it is not distorted
  by days with little revenue.

Pure Python on a list of (day, revenue) pairs, so it is easy to test.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta

LEVEL_DAYS = 28
SEASON_DAYS = 56
BACKTEST_DAYS = 14
HORIZON_DAYS = 14
MIN_TRAINING_DAYS = LEVEL_DAYS + BACKTEST_DAYS  # enough to fit and to backtest
SHRINK = 0.5


@dataclass(frozen=True)
class Forecast:
    days: list[tuple[date, float, float, float]]  # (day, forecast, lower, upper)
    training_days: int
    backtest_wape: float | None


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def fill_days(series: dict[date, float], start: date, end: date) -> list[tuple[date, float]]:
    """Every day from start to end inclusive; days without orders count as 0."""
    out = []
    day = start
    while day <= end:
        out.append((day, series.get(day, 0.0)))
        day += timedelta(days=1)
    return out


def fit(history: list[tuple[date, float]]):
    """Returns predict(day) for days after the history."""
    level_values = [v for _, v in history[-LEVEL_DAYS:]]
    level = _mean(level_values)
    season = history[-SEASON_DAYS:]
    season_mean = _mean([v for _, v in season])
    factors = {}
    for weekday in range(7):
        values = [v for d, v in season if d.weekday() == weekday]
        raw = _mean(values) / season_mean if values and season_mean > 0 else 1.0
        factors[weekday] = 1 + SHRINK * (raw - 1)
    return lambda day: max(0.0, level * factors[day.weekday()])


def _percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    position = (len(sorted_values) - 1) * q
    low, high = math.floor(position), math.ceil(position)
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (position - low)


def wape(actual: list[float], predicted: list[float]) -> float | None:
    total = sum(actual)
    if total <= 0:
        return None
    return sum(abs(a - p) for a, p in zip(actual, predicted, strict=True)) / total


def backtest(history: list[tuple[date, float]]) -> float | None:
    train, test = history[:-BACKTEST_DAYS], history[-BACKTEST_DAYS:]
    predict = fit(train)
    return wape([v for _, v in test], [predict(d) for d, _ in test])


def relative_errors(history: list[tuple[date, float]]) -> list[float]:
    """One-step-ahead relative errors over the last LEVEL_DAYS days (for the interval)."""
    errors = []
    for i in range(len(history) - LEVEL_DAYS, len(history)):
        if i < LEVEL_DAYS:
            continue
        predicted = fit(history[:i])(history[i][0])
        if predicted > 0:
            errors.append((history[i][1] - predicted) / predicted)
    return sorted(errors)


def forecast(history: list[tuple[date, float]], start: date) -> Forecast | None:
    """Forecasts HORIZON_DAYS days from `start`, or None with too little history."""
    if len(history) < MIN_TRAINING_DAYS:
        return None
    predict = fit(history)
    errors = relative_errors(history)
    low_q, high_q = _percentile(errors, 0.1), _percentile(errors, 0.9)
    days = []
    for i in range(HORIZON_DAYS):
        day = start + timedelta(days=i)
        point = predict(day)
        lower = max(0.0, point * (1 + min(low_q, 0.0)))
        upper = point * (1 + max(high_q, 0.0))
        days.append((day, round(point, 2), round(lower, 2), round(upper, 2)))
    return Forecast(days=days, training_days=len(history), backtest_wape=backtest(history))
