"""Per-gauge streamflow diagnostics and threshold-based gauge selection.

Diagnostics use observed streamflow only. Coverage thresholds decide pass/fail;
flags mark gauges for review and never drop a gauge on their own. All
thresholds come from the ``gauge_selection`` block of configs/data.yaml.
"""

from collections.abc import Iterable, Mapping

import numpy as np
import pandas as pd

SPLITS = ("train", "validation", "test")
EARTH_RADIUS_KM = 6371.0088

FLAG_COLUMNS = [
    "flag_heavy_dam",
    "flag_small_area",
    "flag_many_zero_days",
    "flag_long_constant_run",
    "flag_coord_mismatch",
    "flag_no_test_high_flow",
]


def coverage_pct(s: pd.Series, start=None, end=None, months: Iterable[int] | None = None) -> float:
    """Percent of days in [start, end] (optionally only ``months``) with a value.

    ``s`` must have a complete daily DatetimeIndex; the denominator is every day
    in the window, so gaps are counted as missing.
    """
    window = s.loc[start:end]
    if months is not None:
        window = window[window.index.month.isin(list(months))]
    if len(window) == 0:
        return float("nan")
    return 100.0 * window.notna().sum() / len(window)


def longest_run(mask: Iterable[bool]) -> int:
    """Length of the longest run of consecutive True values."""
    best = current = 0
    for value in mask:
        current = current + 1 if value else 0
        best = max(best, current)
    return best


def longest_missing_run(s: pd.Series) -> int:
    return longest_run(s.isna().to_numpy())


def longest_identical_nonzero_run(s: pd.Series) -> int:
    """Longest run of identical consecutive non-zero values (missing days break runs)."""
    values = s.to_numpy(dtype="float64")
    best = current = 0
    previous = np.nan
    for v in values:
        if np.isnan(v) or v == 0.0:
            current = 0
        elif v == previous:
            current += 1
        else:
            current = 1
        previous = v
        best = max(best, current)
    return best


def zero_flow_pct(s: pd.Series) -> float:
    """Percent of observed (non-missing) days with exactly zero flow."""
    observed = s.dropna()
    if observed.empty:
        return float("nan")
    return 100.0 * (observed == 0.0).sum() / len(observed)


def count_test_days_above_train_quantile(s: pd.Series, train: Mapping, test: Mapping, q: float):
    """(threshold, count): days in test above the gauge's own train-period quantile."""
    train_obs = s.loc[train["start"]:train["end"]].dropna()
    if train_obs.empty:
        return float("nan"), 0
    threshold = float(train_obs.quantile(q))
    test_obs = s.loc[test["start"]:test["end"]].dropna()
    return threshold, int((test_obs > threshold).sum())


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = (np.sin((lat2 - lat1) / 2) ** 2
         + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def compute_diagnostics(
    streamflow: pd.DataFrame,
    gauges: pd.DataFrame,
    splits: Mapping[str, Mapping],
    monsoon_months: Iterable[int],
    high_flow_quantile: float,
) -> pd.DataFrame:
    """One row per gauge with coverage, data-quality and attribute diagnostics.

    ``splits`` maps "train" / "validation" / "test" to {"start", "end"} dates.
    """
    monsoon_months = list(monsoon_months)
    rows = {}
    for gid in gauges.index:
        s = streamflow[gid]
        row = {"coverage_total_pct": coverage_pct(s)}
        for name in SPLITS:
            p = splits[name]
            row[f"coverage_{name}_pct"] = coverage_pct(s, p["start"], p["end"])
            row[f"monsoon_coverage_{name}_pct"] = coverage_pct(
                s, p["start"], p["end"], months=monsoon_months)
        row["longest_missing_run_days"] = longest_missing_run(s)
        row["zero_flow_pct"] = zero_flow_pct(s)
        row["longest_identical_nonzero_run_days"] = longest_identical_nonzero_run(s)
        threshold, n_high = count_test_days_above_train_quantile(
            s, splits["train"], splits["test"], high_flow_quantile)
        row["train_high_flow_threshold_m3s"] = threshold
        row["test_days_above_train_high_flow"] = n_high
        rows[gid] = row

    diag = pd.DataFrame.from_dict(rows, orient="index")
    diag.index.name = "gauge_id"
    attrs = gauges.copy()
    attrs["cwc_ghi_distance_km"] = haversine_km(
        attrs["cwc_lat"], attrs["cwc_lon"], attrs["ghi_lat"], attrs["ghi_lon"])
    return attrs.join(diag)


def compute_flags(diag: pd.DataFrame, flag_cfg: Mapping) -> pd.DataFrame:
    """Boolean review flags. Missing attribute values never raise a flag."""
    flags = pd.DataFrame(index=diag.index)
    flags["flag_heavy_dam"] = diag["reservoir_index"] >= flag_cfg["heavy_dam_reservoir_index_min"]
    flags["flag_small_area"] = diag["ghi_area"] < flag_cfg["small_area_km2_max"]
    flags["flag_many_zero_days"] = diag["zero_flow_pct"] > flag_cfg["zero_flow_pct_max"]
    flags["flag_long_constant_run"] = (
        diag["longest_identical_nonzero_run_days"] >= flag_cfg["constant_run_days_min"])
    flags["flag_coord_mismatch"] = diag["cwc_ghi_distance_km"] > flag_cfg["coord_mismatch_km_max"]
    flags["flag_no_test_high_flow"] = diag["test_days_above_train_high_flow"] == 0
    return flags.fillna(False).astype(bool)


def apply_thresholds(diag: pd.DataFrame, preset: Mapping) -> pd.DataFrame:
    """Return ``passes`` (bool) and ``fail_reasons`` (str) for one threshold preset.

    ``preset`` has ``coverage_min`` and ``monsoon_coverage_min``, each mapping
    split name -> minimum percent. NaN coverage counts as a failure.
    """
    reasons = pd.Series([[] for _ in range(len(diag))], index=diag.index, dtype=object)
    checks = [("coverage_min", "coverage_{}_pct", "coverage"),
              ("monsoon_coverage_min", "monsoon_coverage_{}_pct", "monsoon coverage")]
    for key, column, label in checks:
        for split in SPLITS:
            minimum = preset[key][split]
            values = diag[column.format(split)]
            failed = ~(values >= minimum)
            for gid in diag.index[failed]:
                reasons[gid].append(f"{label} {split} {values[gid]:.1f}% < {minimum}%")
    out = pd.DataFrame(index=diag.index)
    out["passes"] = reasons.map(len) == 0
    out["fail_reasons"] = reasons.map("; ".join)
    return out


def apply_manual_includes(passes: pd.Series, manual_include: Iterable[Mapping]) -> pd.DataFrame:
    """Combine the threshold result with manually included gauges.

    Returns ``selected`` (bool), ``selection`` ("thresholds", "manual_include"
    or "") and ``manual_reason``. Every entry needs a known ``gauge_id`` and a
    non-empty ``reason``.
    """
    out = pd.DataFrame(index=passes.index)
    out["selected"] = passes.astype(bool)
    out["selection"] = passes.map({True: "thresholds", False: ""})
    out["manual_reason"] = ""
    for entry in manual_include or []:
        gid, reason = str(entry["gauge_id"]), str(entry.get("reason", "")).strip()
        if gid not in out.index:
            raise KeyError(f"manual_include gauge {gid!r} is not a candidate gauge")
        if not reason:
            raise ValueError(f"manual_include gauge {gid!r} needs a reason")
        out.loc[gid, "manual_reason"] = reason
        if not out.loc[gid, "selected"]:
            out.loc[gid, ["selected", "selection"]] = [True, "manual_include"]
    return out
