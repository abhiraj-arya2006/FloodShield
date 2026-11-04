"""Tests for the alert-margin counts and the fixed selection rule."""

import numpy as np
import pandas as pd
import pytest

from floodshield.inference.alert_margin import alert_counts, select_margin


def sweep(rows):
    return pd.DataFrame([{"margin": m, "lead_day": k, "hit_rate": h, "false_alarm_share": f}
                         for m, k, h, f in rows])


def test_margin_lowers_the_alert_level_as_a_fraction_of_each_threshold():
    pred = np.array([80.0, 79.0, 800.0, 790.0])
    obs = np.array([120.0, 120.0, 1200.0, 50.0])
    thr = np.array([100.0, 100.0, 1000.0, 1000.0])
    c = alert_counts(pred, obs, thr, 0.2)
    assert (c["hits"], c["misses"], c["false_alarms"], c["correct_negatives"]) == (2, 1, 0, 1)
    assert c["hit_rate"] == 2 / 3 and c["accuracy"] == 3 / 4


def test_alert_at_the_level_but_flood_only_above_the_threshold():
    c = alert_counts(np.array([100.0]), np.array([100.0]), np.array([100.0]), 0.0)
    assert (c["hits"], c["false_alarms"]) == (0, 1)


def test_primary_picks_smallest_margin_passing_at_every_lead():
    s = sweep([(0.1, 2, 0.95, 0.4), (0.1, 3, 0.89, 0.4),
               (0.2, 2, 0.95, 0.5), (0.2, 3, 0.90, 0.6),
               (0.3, 2, 0.99, 0.5), (0.3, 3, 0.99, 0.5)])
    choice = select_margin(s)
    assert choice["margin"] == 0.2 and choice["branch"] == "primary" and choice["target_reachable"]


def test_fallback_when_the_hit_target_costs_too_many_false_alarms():
    s = sweep([(0.1, 2, 0.70, 0.40), (0.1, 3, 0.70, 0.40),
               (0.2, 2, 0.90, 0.45), (0.2, 3, 0.75, 0.50),
               (0.3, 2, 0.80, 0.50), (0.3, 3, 0.80, 0.51),
               (0.4, 2, 0.95, 0.61), (0.4, 3, 0.95, 0.70)])
    choice = select_margin(s)
    assert choice["margin"] == 0.2 and choice["branch"] == "fallback" and not choice["target_reachable"]
    assert choice["smallest_margin_reaching_hit_target"] == 0.4


def test_no_margin_within_the_fallback_limit_is_an_error():
    with pytest.raises(ValueError):
        select_margin(sweep([(0.1, 2, 0.5, 0.7)]))
