"""Leakage-safe transforms: statistics are fitted on the TRAIN period only.

- Targets: log1p(q) then standardised PER GAUGE with train-period mean/std of
  log1p(q) over observed days. Inverse: q = expm1(z * std + mean).
- Dynamic features: optional log1p (prcp), then standardised PER FEATURE with
  train-period mean/std pooled over all gauges and days (keeps between-gauge
  differences, e.g. wetter catchments stay wetter).
- Static features: standardised across the gauges (no time dimension).

Missing values stay NaN through every transform; nothing is filled here.
"""

from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd


@dataclass
class Normaliser:
    """Element-wise (x - mean) / std, optionally after log1p."""
    mean: np.ndarray
    std: np.ndarray
    log1p: bool

    def transform(self, x: np.ndarray) -> np.ndarray:
        x = np.asarray(x, dtype="float64")
        if self.log1p:
            x = np.log1p(x)
        return (x - self.mean) / self.std

    def inverse(self, z: np.ndarray) -> np.ndarray:
        x = np.asarray(z, dtype="float64") * self.std + self.mean
        return np.expm1(x) if self.log1p else x

    def to_dict(self) -> dict:
        d = asdict(self)
        d["mean"], d["std"] = np.asarray(self.mean).tolist(), np.asarray(self.std).tolist()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Normaliser":
        return cls(np.asarray(d["mean"]), np.asarray(d["std"]), bool(d["log1p"]))


def _safe_std(std: np.ndarray, what: str) -> np.ndarray:
    std = np.asarray(std, dtype="float64")
    if np.any(~np.isfinite(std)) or np.any(std <= 0):
        raise ValueError(f"{what}: zero, negative or undefined std in the train period")
    return std


def fit_target_normaliser(q_train: np.ndarray) -> Normaliser:
    """``q_train`` [T_train, N] in m3/s, NaN = missing. Per-gauge stats of log1p(q)."""
    lq = np.log1p(np.asarray(q_train, dtype="float64"))
    if np.any(np.sum(np.isfinite(lq), axis=0) < 2):
        raise ValueError("a gauge has fewer than 2 observed train days")
    mean = np.nanmean(lq, axis=0)
    return Normaliser(mean, _safe_std(np.nanstd(lq, axis=0), "target"), log1p=True)


def fit_feature_normalisers(x_train: np.ndarray, names: Sequence[str],
                            log1p_features: Sequence[str]) -> dict[str, Normaliser]:
    """``x_train`` [T_train, N, F]. One pooled normaliser per feature."""
    out = {}
    for k, name in enumerate(names):
        v = np.asarray(x_train[..., k], dtype="float64")
        use_log = name in set(log1p_features)
        if use_log:
            if np.nanmin(v) < 0:
                raise ValueError(f"{name}: log1p needs values >= 0")
            v = np.log1p(v)
        out[name] = Normaliser(np.nanmean(v), _safe_std(np.nanstd(v), name), log1p=use_log)
    return out


def apply_feature_normalisers(x: np.ndarray, names: Sequence[str],
                              norms: dict[str, Normaliser]) -> np.ndarray:
    return np.stack([norms[n].transform(x[..., k]) for k, n in enumerate(names)], axis=-1)


def fit_static_normaliser(s: np.ndarray) -> Normaliser:
    """``s`` [N, S]: z-score each static column across gauges."""
    s = np.asarray(s, dtype="float64")
    if np.isnan(s).any():
        raise ValueError("static features contain NaN")
    return Normaliser(s.mean(axis=0), _safe_std(s.std(axis=0), "static"), log1p=False)


def fit_train_statistics(dates, cube: np.ndarray, q: np.ndarray, feature_names: Sequence[str],
                         log1p_features: Sequence[str], start: str, end: str
                         ) -> tuple[dict[str, Normaliser], Normaliser]:
    """Fit dynamic-feature and target normalisers on days in [start, end] only.

    ``cube`` [T, N, F] and ``q`` [T, N] cover all dates; values outside the
    period never reach the statistics.
    """
    d = pd.DatetimeIndex(dates)
    in_period = np.asarray((d >= pd.Timestamp(start)) & (d <= pd.Timestamp(end)))
    feature_norms = fit_feature_normalisers(cube[in_period], feature_names, log1p_features)
    return feature_norms, fit_target_normaliser(q[in_period])
