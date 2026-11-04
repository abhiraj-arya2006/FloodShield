"""Leakage and split tests for the XGBoost residual table (tiny in-memory data)."""

import numpy as np
import pandas as pd

from floodshield.correction.residual import (
    assign_split,
    build_table,
    feature_columns,
    peak_ratio,
    rain_features,
    to_flow,
)
from floodshield.data.preprocessing import Normaliser

FIT = {"start": "2009-01-01", "end": "2011-12-31"}
HOLDOUT = {"start": "2012-01-01", "end": "2012-12-31"}
IDS = ["03005", "08001"]
H = 4


def toy(seed=0):
    rng = np.random.default_rng(seed)
    days = pd.date_range("2011-12-01", "2012-01-31", freq="D")
    rain = pd.DataFrame(rng.gamma(2.0, 3.0, (len(days), 2)), index=days, columns=IDS)
    samples = pd.date_range("2011-12-20", "2012-01-10", freq="D")
    rows = [(g, t, t + pd.Timedelta(days=k), k) for t in samples for k in range(1, H + 1) for g in IDS]
    frame = pd.DataFrame(rows, columns=["gauge_id", "sample_date", "target_date", "lead_day"])
    frame["predicted_z"] = rng.normal(size=len(frame))
    frame["predicted_m3s"] = 1.0
    frame["observed_m3s"] = rng.gamma(2.0, 50.0, len(frame))
    frame["mask"] = 1
    static = pd.DataFrame({"area": [1.0, -1.0], "dams": [0.5, -0.5]}, index=IDS)
    norm = Normaliser(np.array([2.0, 3.0]), np.array([0.5, 2.0]), log1p=True)
    return frame, rain, static, norm


def make(frame, rain, static, norm):
    return build_table(frame, rain, static, norm, IDS, [3, 7], H, FIT, HOLDOUT)


def test_features_contain_no_flow_columns():
    columns = feature_columns([3, 7], H, ["area", "dams"])
    assert not [c for c in columns if "observed" in c or "residual" in c or "m3s" in c or "mask" in c]


def test_features_do_not_change_when_observed_flow_changes():
    frame, rain, static, norm = toy()
    columns = feature_columns([3, 7], H, static.columns)
    first = make(frame, rain, static, norm)[columns]
    changed = frame.copy()
    changed["observed_m3s"] = changed["observed_m3s"] * 100.0 + 7.0
    changed.loc[::3, "mask"] = 0
    pd.testing.assert_frame_equal(first, make(changed, rain, static, norm)[columns])


def test_residual_uses_training_scaling_and_is_missing_on_masked_days():
    frame, rain, static, norm = toy()
    frame.loc[0, "mask"] = 0
    table = make(frame, rain, static, norm)
    assert np.isnan(table.loc[0, "residual"])
    row = table.iloc[1]                                       # gauge 08001
    z = (np.log1p(row["observed_m3s"]) - 3.0) / 2.0
    assert np.isclose(row["residual"], z - row["predicted_z"])


def test_split_keeps_forecasts_inside_one_period():
    dates = pd.Series(pd.to_datetime(["2011-12-27", "2011-12-28", "2011-12-29", "2011-12-30", "2011-12-31"]))
    assert assign_split(dates, H, FIT, HOLDOUT).tolist() == ["fit", "boundary", "boundary", "boundary", "holdout"]


def test_no_fit_row_sees_a_holdout_year_target_or_rain_day():
    frame, rain, static, norm = toy()
    table = make(frame, rain, static, norm)
    fit = table[table["split"] == "fit"]
    assert fit["target_date"].max() <= pd.Timestamp("2011-12-31")
    assert (fit["sample_date"] + pd.Timedelta(days=H)).max() <= pd.Timestamp("2011-12-31")


def test_rain_windows_stop_at_t_and_future_days_line_up():
    days = pd.date_range("2012-01-01", periods=12, freq="D")
    rain = pd.DataFrame({"03005": np.arange(12.0), "08001": 0.0}, index=days)
    row = rain_features(rain, [3, 7], H).loc[(days[7], "03005")]
    assert row["rain_past_3d_mm"] == 5 + 6 + 7
    assert row["rain_past_7d_mm"] == sum(range(1, 8))
    assert [row[f"rain_t{k}_mm"] for k in range(1, 5)] == [8, 9, 10, 11]


def test_to_flow_inverts_the_scaling_and_floors_at_zero():
    norm = Normaliser(np.array([2.0, 3.0]), np.array([0.5, 2.0]), log1p=True)
    z = (np.log1p(np.array([40.0, 90.0])) - norm.mean) / norm.std
    assert np.allclose(to_flow(z, np.array([0, 1]), norm), [40.0, 90.0])
    assert to_flow(np.array([-100.0]), np.array([0]), norm)[0] == 0.0


def test_peak_ratio_uses_largest_observed_days_only():
    obs = np.array([np.nan, 1.0, 10.0, 20.0])
    pred = np.array([1000.0, 1000.0, 5.0, 10.0])
    assert peak_ratio(pred, obs, 2) == 0.5
    assert np.isnan(peak_ratio(pred, obs, 4))                 # fewer observed days than asked for
