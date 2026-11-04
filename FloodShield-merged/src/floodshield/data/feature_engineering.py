"""Static catchment features built from a config spec, with leakage guards.

Each spec entry is ``{name, source, column, transform}``:
- source ``topo`` / ``anth`` / ``land`` / ``soil``: a column of
  ``attributes_csv/camels_ind_<source>.csv``;
- source ``forcings_train``: a climate descriptor computed here from the
  CAMELS forcings over the TRAIN period only (never from streamflow).
transform: ``none``, ``log10`` or ``log1p``.

Columns derived from observed streamflow must never be used; the excluded
files/columns come from config and are checked before anything is read.
"""

from collections.abc import Mapping, Sequence
from pathlib import Path

import numpy as np
import pandas as pd

from floodshield.data.camels_ind_loader import read_attributes

ATTRIBUTE_SOURCES = {"topo", "anth", "land", "soil", "clim", "geol", "name", "hydro"}
TRANSFORMS = {"none": lambda v: v, "log10": np.log10, "log1p": np.log1p}


def check_static_spec(spec: Sequence[Mapping], excluded_files: Sequence[str],
                      excluded_columns: Sequence[str]) -> None:
    """Raise if any spec entry uses an excluded file or column."""
    for e in spec:
        if e["source"] in set(excluded_files):
            raise ValueError(f"static feature {e['name']!r} uses excluded file {e['source']!r}")
        if e["column"] in set(excluded_columns):
            raise ValueError(f"static feature {e['name']!r} uses excluded column {e['column']!r}")
        if e.get("transform", "none") not in TRANSFORMS:
            raise ValueError(f"unknown transform {e.get('transform')!r} for {e['name']!r}")


def train_climate_descriptors(forcings: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Per-gauge climate descriptors from train-period forcings (long table with
    gauge_id, date, prcp, tavg, pet). Definitions follow CAMELS-IND Table 3:

    - p_mean: mean daily precipitation (mm/day)
    - high_prec_freq: days/year with prcp >= 5 x p_mean
    - aridity_p_pet: mean prcp / mean pet (pet: Singer et al. PET column)
    - tavg_mean: mean daily (tmax + tmin) / 2 (C)
    """
    f = forcings[(forcings["date"] >= start) & (forcings["date"] <= end)]
    years = (pd.Timestamp(end) - pd.Timestamp(start)).days / 365.25
    rows = {}
    for gid, g in f.groupby("gauge_id"):
        p_mean = g["prcp"].mean()
        rows[gid] = {
            "p_mean": p_mean,
            "high_prec_freq": (g["prcp"] >= 5 * p_mean).sum() / years,
            "aridity_p_pet": p_mean / g["pet"].mean(),
            "tavg_mean": g["tavg"].mean(),
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def build_static_features(raw_dir: Path, gauge_ids: Sequence[str], spec: Sequence[Mapping],
                          climate: pd.DataFrame, excluded_files: Sequence[str],
                          excluded_columns: Sequence[str]) -> pd.DataFrame:
    """[N, S] table (rows in ``gauge_ids`` order, columns = spec names), untransformed
    except for the per-entry ``transform``. Raises on NaN."""
    check_static_spec(spec, excluded_files, excluded_columns)
    cache: dict[str, pd.DataFrame] = {}
    out = pd.DataFrame(index=list(gauge_ids))
    for e in spec:
        if e["source"] == "forcings_train":
            values = climate.loc[list(gauge_ids), e["column"]]
        elif e["source"] in ATTRIBUTE_SOURCES:
            if e["source"] not in cache:
                cache[e["source"]] = read_attributes(raw_dir, e["source"])
            values = cache[e["source"]].loc[list(gauge_ids), e["column"]]
        else:
            raise ValueError(f"unknown static source {e['source']!r}")
        out[e["name"]] = TRANSFORMS[e.get("transform", "none")](values.astype("float64").to_numpy())
    if out.isna().any().any():
        raise ValueError(f"NaN in static features: {out.columns[out.isna().any()].tolist()}")
    return out
