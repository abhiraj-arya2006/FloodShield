"""Leakage and windowing tests for the STG-Mamba training data (tiny in-memory data)."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import torch
import yaml

from floodshield.data.feature_engineering import check_static_spec, train_climate_descriptors
from floodshield.data.flow_thresholds import count_events, period_thresholds
from floodshield.data.preprocessing import Normaliser, fit_train_statistics
from floodshield.data.sequence_dataset import (
    WindowDataset,
    announce_future_rain_mode,
    sample_indices,
)
from floodshield.inference.risk_thresholds import headline_lead_days

REPO = Path(__file__).resolve().parents[1]
TRAIN = ("2000-01-01", "2000-03-31")
VAL = ("2000-04-01", "2000-04-30")
TEST = ("2000-05-01", "2000-05-31")


def toy(seed=0):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("1999-12-01", "2000-05-31", freq="D")
    cube = rng.gamma(2.0, 3.0, size=(len(dates), 3, 2))      # [T, N, F]: prcp, tmax
    q = rng.gamma(2.0, 50.0, size=(len(dates), 3))
    q[rng.random(q.shape) < 0.1] = np.nan
    return dates, cube, q


def outside_train(dates):
    return np.asarray((dates < pd.Timestamp(TRAIN[0])) | (dates > pd.Timestamp(TRAIN[1])))


def test_normalisers_ignore_validation_and_test_data():
    dates, cube, q = toy()
    norms_a, tn_a = fit_train_statistics(dates, cube, q, ["prcp", "tmax"], ["prcp"], *TRAIN)
    cube2, q2 = cube.copy(), q.copy()
    out = outside_train(dates)
    cube2[out] *= 1000.0
    q2[out] = 1e6
    norms_b, tn_b = fit_train_statistics(dates, cube2, q2, ["prcp", "tmax"], ["prcp"], *TRAIN)
    for k in norms_a:
        assert norms_a[k].mean == norms_b[k].mean and norms_a[k].std == norms_b[k].std
    np.testing.assert_array_equal(tn_a.mean, tn_b.mean)
    np.testing.assert_array_equal(tn_a.std, tn_b.std)


def test_thresholds_ignore_validation_and_test_data():
    dates, _, q = toy()
    qa = pd.DataFrame(q, index=dates, columns=["03001", "03002", "08001"])
    qb = qa.copy()
    qb.loc[outside_train(dates)] = 1e6
    pd.testing.assert_frame_equal(period_thresholds(qa, *TRAIN, [0.9, 0.95, 0.99]),
                                  period_thresholds(qb, *TRAIN, [0.9, 0.95, 0.99]))


def test_target_inverse_round_trip_and_log1p():
    dates, cube, q = toy()
    _, tn = fit_train_statistics(dates, cube, q, ["prcp", "tmax"], ["prcp"], *TRAIN)
    back = tn.inverse(tn.transform(q))
    np.testing.assert_allclose(back[np.isfinite(q)], q[np.isfinite(q)], rtol=1e-10)
    assert np.isnan(tn.transform(q))[np.isnan(q)].all()       # missing stays missing
    assert Normaliser.from_dict(tn.to_dict()).std.tolist() == tn.std.tolist()


@pytest.mark.parametrize("period", [TRAIN, VAL, TEST])
def test_every_target_day_lies_inside_its_split(period):
    dates, _, q = toy()
    mask = np.isfinite(q)
    L, H = 30, 4
    t = sample_indices(dates, mask, *period, L, H)
    assert len(t) > 0
    for i in t:
        targets = dates[i + 1:i + 1 + H]
        assert targets.min() >= pd.Timestamp(period[0]) and targets.max() <= pd.Timestamp(period[1])
        assert i - L + 1 >= 0                                   # past window fits in the arrays
    # the past window may reach before the split start
    assert dates[t[0] - L + 1] < pd.Timestamp(period[0])


def test_samples_with_all_targets_missing_are_skipped():
    dates = pd.date_range("2000-01-01", periods=40, freq="D")
    mask = np.ones((40, 2), dtype=bool)
    mask[20:24] = False                                         # targets of t = 19 all missing
    t = sample_indices(dates, mask, "2000-01-01", "2000-02-09", 10, 4)
    assert 19 not in t and 18 in t and 20 in t


def test_dataset_shapes_dtype_and_views():
    dates, cube, q = toy()
    _, N, F = cube.shape
    static = np.ones((N, 5))
    mask = np.isfinite(q).astype(np.float32)
    t = sample_indices(dates, mask, *TRAIN, 30, 4)
    ds = WindowDataset(cube, cube[..., 0], q, mask, static, dates, t, 30, 4)
    b = ds[0]
    assert b["x_past"].shape == (30, N, F) and b["x_future"].shape == (4, N, 1)
    assert b["static"].shape == (N, 5) and b["y"].shape == (4, N) and b["mask"].shape == (4, N)
    assert all(b[k].dtype == torch.float32 for k in ("x_past", "x_future", "static", "y", "mask"))
    assert b["x_past"].untyped_storage().data_ptr() == ds.x.untyped_storage().data_ptr()  # a view
    assert b["t"] == dates[t[0]].strftime("%Y-%m-%d")
    assert torch.all(b["y"][b["mask"] == 0] == 0)               # missing targets: masked, not filled


def test_excluded_streamflow_columns_rejected_and_absent_from_config():
    excluded_files, excluded_cols = ["hydro"], ["reservoir_index", "flow_availability", "ghi_group"]
    with pytest.raises(ValueError, match="excluded file"):
        check_static_spec([{"name": "q", "source": "hydro", "column": "q_mean"}], excluded_files, excluded_cols)
    with pytest.raises(ValueError, match="excluded column"):
        check_static_spec([{"name": "ri", "source": "anth", "column": "reservoir_index"}],
                          excluded_files, excluded_cols)
    cfg = yaml.safe_load((REPO / "configs" / "model.yaml").read_text())["input"]
    for col in excluded_cols:
        assert col in cfg["static_excluded_columns"]
    assert "hydro" in cfg["static_excluded_files"]
    check_static_spec(cfg["static_features"], cfg["static_excluded_files"], cfg["static_excluded_columns"])
    used = {e["column"] for e in cfg["static_features"]} | {e["source"] for e in cfg["static_features"]}
    assert not used & (set(cfg["static_excluded_columns"]) | set(cfg["static_excluded_files"]))


def test_climate_descriptors_use_train_period_only():
    dates = pd.date_range("2000-01-01", "2001-12-31", freq="D")
    f = pd.DataFrame({"gauge_id": "03001", "date": dates, "prcp": 1.0, "tavg": 25.0, "pet": 4.0})
    a = train_climate_descriptors(f, "2000-01-01", "2000-12-31")
    f.loc[f.date > "2000-12-31", ["prcp", "tavg", "pet"]] = 999.0
    b = train_climate_descriptors(f, "2000-01-01", "2000-12-31")
    pd.testing.assert_frame_equal(a, b)
    assert a.loc["03001", "aridity_p_pet"] == pytest.approx(0.25)


@pytest.mark.parametrize("values, expected", [
    ([1, 5, 6, 1, 7, 8, 9, 1], (5, 2)),          # two separate runs above 4
    ([5, 6, np.nan, 7, 8], (4, 2)),              # a missing day ends an event
    ([np.nan, np.nan], (0, 0)),
    ([4, 4, 4], (0, 0)),                         # equal to the threshold is not above
])
def test_event_counting(values, expected):
    assert count_events(np.array(values, dtype=float), 4.0) == expected


def test_future_rain_modes():
    announce_future_rain_mode("observed")
    with pytest.raises(NotImplementedError):
        announce_future_rain_mode("noisy", {"error_model": None, "params": None})
    with pytest.raises(ValueError):
        announce_future_rain_mode("forecast")


def test_headline_lead_days_from_lag_and_horizon():
    assert headline_lead_days(1, 4) == [2, 3, 4]
    with pytest.raises(ValueError):
        headline_lead_days(4, 4)
