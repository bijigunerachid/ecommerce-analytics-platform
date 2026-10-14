"""The forecast model is plain Python: fast tests on synthetic series."""

from datetime import date, timedelta

import pytest

from ecommerce_analytics import forecast as fc

START = date(2026, 1, 5)  # a Monday


def series(days: int, value_for) -> list[tuple[date, float]]:
    return [(START + timedelta(days=i), value_for(START + timedelta(days=i))) for i in range(days)]


def test_fill_days_counts_days_without_orders_as_zero():
    filled = fc.fill_days(
        {date(2026, 1, 1): 5.0, date(2026, 1, 3): 7.0}, date(2026, 1, 1), date(2026, 1, 4)
    )
    assert filled == [
        (date(2026, 1, 1), 5.0),
        (date(2026, 1, 2), 0.0),
        (date(2026, 1, 3), 7.0),
        (date(2026, 1, 4), 0.0),
    ]


def test_needs_enough_history():
    assert fc.forecast(series(fc.MIN_TRAINING_DAYS - 1, lambda d: 100.0), START) is None


def test_flat_history_forecasts_the_same_level_exactly():
    history = series(70, lambda d: 100.0)
    start = history[-1][0] + timedelta(days=1)
    result = fc.forecast(history, start)
    assert len(result.days) == fc.HORIZON_DAYS
    assert result.days[0] == (start, 100.0, 100.0, 100.0)
    assert result.backtest_wape == 0
    assert result.training_days == 70


def test_learns_the_weekly_pattern_with_shrinkage():
    # Weekends sell twice as much as weekdays.
    history = series(70, lambda d: 200.0 if d.weekday() >= 5 else 100.0)
    start = history[-1][0] + timedelta(days=1)  # a Monday
    result = fc.forecast(history, start)
    by_weekday = {d.weekday(): point for d, point, _, _ in result.days}
    level = (5 * 100 + 2 * 200) / 7
    # Raw factors are 0.78 (weekday) and 1.56 (weekend); shrunk halfway towards 1.
    assert by_weekday[0] == pytest.approx(level * (1 + 0.5 * (100 / level - 1)), abs=0.01)
    assert by_weekday[5] == pytest.approx(level * (1 + 0.5 * (200 / level - 1)), abs=0.01)
    assert by_weekday[5] > by_weekday[0]


def test_interval_widens_with_noise_and_contains_the_forecast():
    noisy = series(84, lambda d: 100.0 + (40 if d.toordinal() % 3 == 0 else -20))
    result = fc.forecast(noisy, noisy[-1][0] + timedelta(days=1))
    for _, point, lower, upper in result.days:
        assert 0 <= lower < point < upper
    assert 0 < result.backtest_wape < 1


def test_wape_ignores_empty_periods():
    assert fc.wape([0, 0], [1, 2]) is None
    assert fc.wape([100, 100], [90, 120]) == pytest.approx(0.15)
