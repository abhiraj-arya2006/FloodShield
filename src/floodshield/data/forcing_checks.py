"""Metadata and plausibility checks for CAMELS-IND catchment-mean forcings.

Checks only COUNT anomalies; nothing is dropped or filled. Names, units and
sources follow the Data Description PDF (Table 1) and the CAMELS-IND paper
(Mangukiya et al., 2025, ESSD 17, 461-491, section 4).
"""

import numpy as np
import pandas as pd

# Source and derivation as stated in the PDF / paper. "not stated" means the
# documents do not give it; do not assume.
FORCING_METADATA = {
    "prcp": ("IMD gridded rainfall, 0.25 deg (Pai et al., 2014)", "daily total"),
    "tmax": ("IMD gridded temperature, 1 deg (Srivastava et al., 2009)", "daily maximum"),
    "tmin": ("IMD gridded temperature, 1 deg (Srivastava et al., 2009)", "daily minimum"),
    "tavg": ("derived", "(tmax + tmin) / 2"),
    "srad_lw": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "daily value; aggregation not stated"),
    "srad_sw": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "daily value; aggregation not stated"),
    "wind_u": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "10 m; aggregation not stated"),
    "wind_v": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "10 m; aggregation not stated"),
    "wind": ("derived", "sqrt(wind_u^2 + wind_v^2)"),
    "rel_hum": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "2 m; aggregation not stated"),
    "pet": ("Singer et al. (2021) hourly PET, 0.1 deg, from ERA5-Land", "from 1981; daily from hourly, method not stated"),
    "pet_gleam": ("GLEAM (Miralles et al., 2011)", "daily; GLEAM version not stated"),
    "aet_gleam": ("GLEAM (Miralles et al., 2011)", "daily; GLEAM version not stated"),
    "evap_canopy": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "rate; aggregation not stated"),
    "evap_surface": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "rate; aggregation not stated"),
    "sm_lvl1": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "layer 0-0.1 m"),
    "sm_lvl2": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "layer 0.1-0.35 m"),
    "sm_lvl3": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "layer 0.35-1 m"),
    "sm_lvl4": ("IMDAA reanalysis, ~12 km (Rani et al., 2021)", "layer 1-3 m"),
}

# Layer thickness (m), from the PDF. Water in a layer cannot exceed
# thickness * 1000 kg/m2 (the layer completely filled with water).
SOIL_LAYER_THICKNESS_M = {"sm_lvl1": 0.1, "sm_lvl2": 0.25, "sm_lvl3": 0.65, "sm_lvl4": 2.0}

TEMPERATURE_RANGE_C = (-10.0, 50.0)   # generous plausibility bounds for India
ROUNDING_TOLERANCE = 0.011            # file values are rounded to 2 decimals
EXACT_ZERO_SUSPECT = ("tmax", "tmin", "tavg", "wind", "rel_hum", "srad_lw", "srad_sw",
                      "sm_lvl1", "sm_lvl2", "sm_lvl3", "sm_lvl4")


def column_summary(df: pd.DataFrame, units: dict[str, str]) -> pd.DataFrame:
    """Per column: unit, source, missing %, first/last observed date, min/mean/max."""
    rows = {}
    for col in df.columns:
        s = df[col]
        observed = s.dropna()
        source, derivation = FORCING_METADATA.get(col, ("unknown", "unknown"))
        rows[col] = {
            "unit": units.get(col, ""),
            "source": source,
            "derivation": derivation,
            "missing_pct": 100.0 * s.isna().mean(),
            "first_observed": observed.index.min() if not observed.empty else pd.NaT,
            "last_observed": observed.index.max() if not observed.empty else pd.NaT,
            "min": observed.min(),
            "mean": observed.mean(),
            "max": observed.max(),
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def plausibility_checks(df: pd.DataFrame) -> dict[str, int]:
    """Number of days violating each check (NaN never counts as a violation)."""
    counts = {}

    def count(name, mask):
        counts[name] = int(np.asarray(mask.fillna(False), dtype=bool).sum())

    count("prcp_negative", df["prcp"] < 0)
    count("tmax_below_tmin", df["tmax"] < df["tmin"])
    lo, hi = TEMPERATURE_RANGE_C
    for col in ("tmax", "tmin", "tavg"):
        count(f"{col}_outside_{lo:g}_{hi:g}C", (df[col] < lo) | (df[col] > hi))
    count("tavg_not_mean_of_tmax_tmin",
          (df["tavg"] - (df["tmax"] + df["tmin"]) / 2).abs() > ROUNDING_TOLERANCE)
    count("wind_not_norm_of_u_v",
          (df["wind"] - np.hypot(df["wind_u"], df["wind_v"])).abs() > ROUNDING_TOLERANCE)
    count("wind_negative", df["wind"] < 0)
    count("rel_hum_outside_0_100", (df["rel_hum"] < 0) | (df["rel_hum"] > 100))
    for col in ("srad_lw", "srad_sw"):
        count(f"{col}_negative", df[col] < 0)
    for col in ("pet", "pet_gleam", "aet_gleam", "evap_canopy", "evap_surface"):
        count(f"{col}_negative", df[col] < 0)
    for col, thickness in SOIL_LAYER_THICKNESS_M.items():
        count(f"{col}_negative", df[col] < 0)
        count(f"{col}_above_{thickness * 1000:g}kgm2", df[col] > thickness * 1000)
    # An exact 0.00 is implausible for these daily means and has marked bad
    # source values (e.g. tmin = 0.00 at every gauge on 2019-01-11).
    for col in EXACT_ZERO_SUSPECT:
        count(f"{col}_exactly_zero", df[col] == 0)
    return counts
