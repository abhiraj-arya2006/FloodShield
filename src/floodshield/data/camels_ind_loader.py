"""Loader for CAMELS-IND v2.2 gauge attributes and observed streamflow.

Gauge IDs are 5-digit strings (first 2 digits = CWC basin code). The CSVs store
them as integers, so the leading zero is lost (``3002`` for ``03002``); every
reader here reads IDs as strings and zero-pads them to 5 characters.

File layout and units follow ``00_CAMELS_IND_Data_Description.pdf``:
- ``attributes_csv/camels_ind_<group>.csv``: one row per gauge.
- ``streamflow_timeseries/streamflow_observed.csv``: columns ``year, month, day``
  then one column per gauge, daily streamflow in m3/s, blank cell = missing.
"""

import re
from collections.abc import Iterable, Mapping
from pathlib import Path

import pandas as pd

GAUGE_ID_LENGTH = 5

# Dam / reservoir columns of camels_ind_anth.csv. Names are as they appear in
# the file header; the PDF (Table 3) calls last_dam_year "latest_dam_year".
DAM_COLUMNS = [
    "num_dams",         # number of large and medium dams in the catchment (IndiaWRIS)
    "n_dams",           # total number of dams in the catchment
    "res_store_sum",    # sum of total volume content of dams, 10^3 m3 (IndiaWRIS)
    "total_storage",    # total storage of the reservoirs, m3
    "reservoir_index",  # ratio of total storage to multi-year annual streamflow, -
    "first_dam_year",   # year of construction of the first dam
    "last_dam_year",    # year of construction of the most recent dam
]

NAME_COLUMNS = ["ghi_stn_id", "cwc_site_name", "river_basin", "cwc_river", "ghi_group",
                "flow_availability"]
# ghi_* are the GHI-relocated station coordinates and area; the CAMELS-IND paper
# notes CWC locations are sometimes spurious, so ghi_* is what we use downstream.
TOPO_COLUMNS = ["ghi_lat", "ghi_lon", "ghi_area", "cwc_lat", "cwc_lon", "cwc_area"]

STREAMFLOW_FILE = Path("streamflow_timeseries") / "streamflow_observed.csv"
FORCINGS_DIR = Path("catchment_mean_forcings")
_HEADER_UNIT = re.compile(r"^(?P<name>[A-Za-z0-9_]+)\((?P<unit>[^)]*)\)$")


def pad_gauge_ids(ids: Iterable) -> pd.Series:
    """Return gauge IDs as zero-padded 5-character strings."""
    s = pd.Series(list(ids), dtype="string").str.strip()
    if s.isna().any() or (s == "").any():
        raise ValueError("empty gauge ID")
    numeric = s.str.fullmatch(r"\d+")
    if not numeric.all():
        raise ValueError(f"non-numeric gauge ID in {s[~numeric].tolist()}")
    padded = s.str.zfill(GAUGE_ID_LENGTH)
    too_long = padded[padded.str.len() != GAUGE_ID_LENGTH]
    if not too_long.empty:
        raise ValueError(f"gauge ID longer than {GAUGE_ID_LENGTH} digits: {too_long.tolist()}")
    return padded.astype(str)


def read_attributes(raw_dir: Path, group: str) -> pd.DataFrame:
    """Read ``attributes_csv/camels_ind_<group>.csv`` indexed by padded gauge_id."""
    path = Path(raw_dir) / "attributes_csv" / f"camels_ind_{group}.csv"
    df = pd.read_csv(path, dtype={"gauge_id": str})
    df["gauge_id"] = pad_gauge_ids(df["gauge_id"]).to_numpy()
    if df["gauge_id"].duplicated().any():
        raise ValueError(f"duplicate gauge IDs in {path}")
    return df.set_index("gauge_id")


def load_gauge_table(raw_dir: Path, basin_prefixes: Mapping[str, str]) -> pd.DataFrame:
    """Name, topo and dam attributes for gauges whose ID starts with a basin prefix.

    ``basin_prefixes`` maps a basin key (e.g. ``"godavari"``) to its 2-digit CWC
    code (e.g. ``"03"``). The result is indexed by gauge_id and has a ``basin`` column.
    """
    names = read_attributes(raw_dir, "name")[NAME_COLUMNS]
    topo = read_attributes(raw_dir, "topo")[TOPO_COLUMNS]
    anth = read_attributes(raw_dir, "anth")[DAM_COLUMNS]
    table = names.join(topo, how="inner").join(anth, how="inner")

    prefix_to_basin = {str(code): basin for basin, code in basin_prefixes.items()}
    prefixes = table.index.str[:2]
    table = table[prefixes.isin(list(prefix_to_basin))].copy()
    table.insert(0, "basin", table.index.str[:2].map(prefix_to_basin))
    return table.sort_index()


def load_streamflow(raw_dir: Path, gauge_ids: Iterable[str] | None = None) -> pd.DataFrame:
    """Observed daily streamflow (m3/s) with a DatetimeIndex; missing days are NaN.

    Columns are padded gauge IDs. If ``gauge_ids`` is given, only those columns
    are returned (all must exist in the file).
    """
    path = Path(raw_dir) / STREAMFLOW_FILE
    df = pd.read_csv(path)
    dates = pd.to_datetime(df[["year", "month", "day"]])
    flows = df.drop(columns=["year", "month", "day"])
    flows.columns = pad_gauge_ids(flows.columns).tolist()
    flows = flows.apply(pd.to_numeric, errors="raise").astype("float64")
    flows.index = pd.DatetimeIndex(dates, name="date")

    if not flows.index.is_monotonic_increasing or flows.index.has_duplicates:
        raise ValueError(f"dates in {path} are not strictly increasing")
    expected = pd.date_range(flows.index[0], flows.index[-1], freq="D")
    if len(expected) != len(flows.index):
        raise ValueError(f"dates in {path} are not a continuous daily series")

    if gauge_ids is not None:
        wanted = list(gauge_ids)
        missing = sorted(set(wanted) - set(flows.columns))
        if missing:
            raise KeyError(f"gauges not in streamflow file: {missing}")
        flows = flows[wanted]
    return flows


def split_header_units(columns: Iterable[str]) -> dict[str, str]:
    """Map ``"prcp(mm/day)"``-style headers to ``{"prcp": "mm/day"}``.

    Raises if a header has no ``name(unit)`` form, so units are never guessed.
    """
    units = {}
    for col in columns:
        m = _HEADER_UNIT.match(col.strip())
        if m is None:
            raise ValueError(f"forcing header without a unit: {col!r}")
        units[m["name"]] = m["unit"]
    return units


def load_forcings(raw_dir: Path, gauge_id: str) -> tuple[pd.DataFrame, dict[str, str]]:
    """Catchment-mean daily forcings for one gauge, as (frame, units).

    The frame has a DatetimeIndex and columns named without the unit suffix;
    ``units`` maps each column to the unit stated in the file header.
    Missing values stay NaN; dates must form a continuous daily series.
    """
    gid = pad_gauge_ids([gauge_id]).iloc[0]
    path = Path(raw_dir) / FORCINGS_DIR / f"{gid}.csv"
    df = pd.read_csv(path)
    dates = pd.to_datetime(df[["year", "month", "day"]])
    values = df.drop(columns=["year", "month", "day"])
    units = split_header_units(values.columns)
    values.columns = list(units)
    values = values.apply(pd.to_numeric, errors="raise").astype("float64")
    values.index = pd.DatetimeIndex(dates, name="date")
    expected = pd.date_range(values.index[0], values.index[-1], freq="D")
    if values.index.has_duplicates or not values.index.equals(expected):
        raise ValueError(f"dates in {path} are not a continuous daily series")
    return values, units
