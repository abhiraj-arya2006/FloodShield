"""Tests for CAMELS-IND loading helpers and gauge-selection logic (tiny in-memory data)."""

import numpy as np
import pandas as pd
import pytest

from floodshield.data.camels_ind_loader import load_streamflow, pad_gauge_ids, read_attributes
from floodshield.data.gauge_selection import (
    apply_manual_includes,
    apply_thresholds,
    count_test_days_above_train_quantile,
    coverage_pct,
    longest_identical_nonzero_run,
    longest_missing_run,
    zero_flow_pct,
)

NAN = np.nan


def daily(values, start="2000-01-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"),
                     dtype="float64")


# --- gauge ID zero-padding -------------------------------------------------

def test_pad_gauge_ids_restores_leading_zero():
    assert pad_gauge_ids(["3002", "08001", "17024", " 4003 "]).tolist() == [
        "03002", "08001", "17024", "04003"]


@pytest.mark.parametrize("bad", ["", "123456", "30a2"])
def test_pad_gauge_ids_rejects_invalid(bad):
    with pytest.raises(ValueError):
        pad_gauge_ids([bad])


def test_readers_pad_ids_from_csv(tmp_path):
    (tmp_path / "attributes_csv").mkdir()
    (tmp_path / "attributes_csv" / "camels_ind_name.csv").write_text(
        "gauge_id,cwc_site_name\n3002,Ambabal\n8001,Basantpur\n")
    names = read_attributes(tmp_path, "name")
    assert names.index.tolist() == ["03002", "08001"]

    (tmp_path / "streamflow_timeseries").mkdir()
    (tmp_path / "streamflow_timeseries" / "streamflow_observed.csv").write_text(
        "year,month,day,3002,8001\n2000,1,1,1.5,\n2000,1,2,,2.0\n")
    flows = load_streamflow(tmp_path)
    assert flows.columns.tolist() == ["03002", "08001"]
    assert isinstance(flows.index, pd.DatetimeIndex)
    assert flows.isna().to_numpy().tolist() == [[False, True], [True, False]]


def test_load_streamflow_rejects_date_gap(tmp_path):
    (tmp_path / "streamflow_timeseries").mkdir()
    (tmp_path / "streamflow_timeseries" / "streamflow_observed.csv").write_text(
        "year,month,day,3002\n2000,1,1,1.0\n2000,1,3,1.0\n")
    with pytest.raises(ValueError, match="continuous"):
        load_streamflow(tmp_path)


# --- coverage and monsoon filtering ---------------------------------------

def test_coverage_counts_missing_days_in_window():
    s = daily([1.0, NAN, 2.0, NAN])  # 2000-01-01..04
    assert coverage_pct(s) == 50.0
    assert coverage_pct(s, "2000-01-01", "2000-01-03") == pytest.approx(200 / 3)
    assert coverage_pct(s, "2000-01-03", "2000-01-03") == 100.0


def test_coverage_empty_window_is_nan():
    assert np.isnan(coverage_pct(daily([1.0]), "2010-01-01", "2010-12-31"))


def test_monsoon_coverage_uses_only_june_to_september():
    idx = pd.date_range("2001-01-01", "2001-12-31", freq="D")
    s = pd.Series(NAN, index=idx)
    monsoon = idx.month.isin([6, 7, 8, 9])
    s[monsoon] = 1.0  # observed only in the monsoon
    assert coverage_pct(s, months=[6, 7, 8, 9]) == 100.0
    assert coverage_pct(s) == pytest.approx(100 * monsoon.sum() / len(idx))

    s[(idx.month == 7)] = NAN  # lose July (31 of 122 monsoon days)
    assert coverage_pct(s, months=[6, 7, 8, 9]) == pytest.approx(100 * 91 / 122)


# --- run lengths, zero flow, high flow -------------------------------------

def test_longest_missing_run():
    assert longest_missing_run(daily([1, NAN, NAN, 2, NAN, NAN, NAN, 3])) == 3
    assert longest_missing_run(daily([1, 2])) == 0


def test_identical_run_ignores_zero_and_breaks_on_missing():
    s = daily([0, 0, 0, 0, 5, 5, 5, NAN, 5, 5, 7, 7, 7, 7])
    assert longest_identical_nonzero_run(s) == 4  # the four 7s; zeros don't count


def test_zero_flow_pct_uses_observed_days_only():
    assert zero_flow_pct(daily([0, 0, 1, NAN])) == pytest.approx(200 / 3)


def test_high_flow_days_against_train_quantile():
    s = daily(list(range(1, 11)) + [5, 20, NAN, 30])  # train = first 10 days
    train = {"start": "2000-01-01", "end": "2000-01-10"}
    test = {"start": "2000-01-11", "end": "2000-01-14"}
    threshold, n = count_test_days_above_train_quantile(s, train, test, 0.95)
    assert threshold == pytest.approx(9.55)
    assert n == 2


# --- threshold logic --------------------------------------------------------

PRESET = {
    "coverage_min": {"train": 70, "validation": 60, "test": 60},
    "monsoon_coverage_min": {"train": 70, "validation": 60, "test": 60},
}


def diag_row(**overrides):
    row = {f"{kind}_{split}_pct": 100.0
           for kind in ("coverage", "monsoon_coverage")
           for split in ("train", "validation", "test")}
    row.update(overrides)
    return row


def test_thresholds_pass_fail_and_reasons():
    diag = pd.DataFrame.from_dict({
        "03001": diag_row(),
        "03002": diag_row(coverage_test_pct=59.9),
        "08001": diag_row(coverage_train_pct=70.0, monsoon_coverage_validation_pct=10.0),
        "08002": diag_row(coverage_validation_pct=NAN),
    }, orient="index")
    result = apply_thresholds(diag, PRESET)

    assert result["passes"].to_dict() == {
        "03001": True, "03002": False, "08001": False, "08002": False}
    assert result.loc["03001", "fail_reasons"] == ""
    assert result.loc["03002", "fail_reasons"] == "coverage test 59.9% < 60%"
    # 70.0 meets ">= 70"; only the monsoon validation check fails
    assert result.loc["08001", "fail_reasons"] == "monsoon coverage validation 10.0% < 60%"
    assert "coverage validation nan% < 60%" in result.loc["08002", "fail_reasons"]


def test_manual_include_overrides_failed_gauge_only():
    passes = pd.Series({"03001": True, "08029": False, "08030": False})
    out = apply_manual_includes(passes, [{"gauge_id": "08029", "reason": "project decision"}])
    assert out["selected"].to_dict() == {"03001": True, "08029": True, "08030": False}
    assert out["selection"].to_dict() == {
        "03001": "thresholds", "08029": "manual_include", "08030": ""}
    assert out.loc["08029", "manual_reason"] == "project decision"


@pytest.mark.parametrize("entry, error", [
    ({"gauge_id": "99999", "reason": "x"}, KeyError),
    ({"gauge_id": "08029", "reason": " "}, ValueError),
])
def test_manual_include_rejects_unknown_id_or_missing_reason(entry, error):
    with pytest.raises(error):
        apply_manual_includes(pd.Series({"08029": False}), [entry])
