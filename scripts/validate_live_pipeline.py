"""Checks the live pipeline against the model's saved validation forecasts.

    python scripts/validate_live_pipeline.py --camels <zip> --saved <ens_perlead_hf5_val_predictions.parquet>

1. Builds catchment sample points from the CAMELS-IND shapefile.
2. Runs the live ensemble code on the original CAMELS-IND weather. It must reproduce the saved
   forecasts, which proves the live code computes what the trained model computed.
3. Runs it on Open-Meteo's archive for the same days and scores both, which measures what
   changing the weather source costs. Validation years only: the locked test years stay untouched.
"""
import argparse
import io
import json
import sys
import time
import urllib.error
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.backend.live import MODEL_DIR, WINDOW_DAYS, HORIZON_DAYS, CatchmentWeather, Ensemble  # noqa: E402

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
WORK = ROOT / "data" / "raw" / "live_validation"
PERIODS = [("2010-03-01", "2010-11-05"), ("2012-03-01", "2012-11-05")]
MARGIN = 0.1


def build_points(archive: zipfile.ZipFile, gauge_ids, step: float = 1.0) -> None:
    import geopandas as gpd
    from shapely.geometry import Point

    WORK.mkdir(parents=True, exist_ok=True)
    for name in archive.namelist():
        if name.startswith("shapefiles_catchment/catchments."):
            (WORK / Path(name).name).write_bytes(archive.read(name))
    shapes = gpd.read_file(WORK / "catchments.shp").to_crs(4326)
    id_column = next(c for c in shapes.columns if shapes[c].astype(str).str.zfill(5).isin(gauge_ids).sum() == len(gauge_ids))
    shapes["gauge_id"] = shapes[id_column].astype(str).str.zfill(5)
    shapes = shapes[shapes.gauge_id.isin(gauge_ids)].set_index("gauge_id")

    points, index, members = [], {}, {}
    for gid in gauge_ids:
        shape = shapes.loc[gid].geometry
        west, south, east, north = shape.bounds
        lats = np.arange(np.floor(south / step) * step, north + step, step)
        lons = np.arange(np.floor(west / step) * step, east + step, step)
        inside = [(round(float(a), 3), round(float(o), 3)) for a in lats for o in lons if shape.contains(Point(o, a))]
        if len(inside) < 2:  # A small catchment that falls between grid points.
            inner = shape.representative_point()
            inside.append((round(inner.y, 3), round(inner.x, 3)))
        members[gid] = []
        for p in inside:
            if p not in index:
                index[p] = len(points)
                points.append(p)
            members[gid].append(index[p])
    (MODEL_DIR / "catchment_points.json").write_text(json.dumps({"step_degrees": step, "points": points, "gauges": members}), encoding="utf-8")
    print(f"Sample points: {len(points)} across {len(members)} catchments, median {int(np.median([len(m) for m in members.values()]))} per catchment")


def load_camels(archive: zipfile.ZipFile, gauge_ids) -> pd.DataFrame:
    frames = {}
    for gid in gauge_ids:
        d = pd.read_csv(io.BytesIO(archive.read(f"catchment_mean_forcings/{gid}.csv")))
        d.index = pd.to_datetime(d[["year", "month", "day"]])
        frames[gid] = d[["prcp(mm/day)", "tmax(C)", "tmin(C)", "tavg(C)"]].set_axis(["prcp", "tmax", "tmin", "tavg"], axis=1)
    return pd.concat(frames, axis=1)


def cube(table: pd.DataFrame, gauge_ids) -> np.ndarray:
    return np.stack([table[g][["prcp", "tmax", "tmin", "tavg"]].to_numpy() for g in gauge_ids], axis=1)


def run_windows(ensemble: Ensemble, dates: pd.DatetimeIndex, values: np.ndarray, starts: pd.DatetimeIndex) -> pd.DataFrame:
    """Forecasts for every start date, in the same long form as the saved predictions."""
    rows, batch = [], 64
    position = {d: i for i, d in enumerate(dates)}
    usable = [d for d in starts if d in position and position[d] >= WINDOW_DAYS - 1 and position[d] + HORIZON_DAYS < len(dates)]
    for i in range(0, len(usable), batch):
        part = usable[i:i + batch]
        past = np.stack([values[position[d] - WINDOW_DAYS + 1:position[d] + 1] for d in part])
        rain = np.stack([values[position[d] + 1:position[d] + 1 + HORIZON_DAYS, :, 0] for d in part])
        flow = ensemble.predict(past, rain)
        for j, d in enumerate(part):
            for k in range(HORIZON_DAYS):
                rows.append(pd.DataFrame({"sample_date": d, "lead_day": k + 1, "gauge_id": ensemble.gauge_ids, "flow": flow[j, k]}))
    return pd.concat(rows, ignore_index=True)


def score(table: pd.DataFrame, column: str, q95: pd.Series) -> dict:
    x = table[(table.lead_day >= 2) & (table["mask"] == 1)]
    level = x.gauge_id.map(q95)
    flood, alert = x.observed_m3s > level, x[column] >= level * (1 - MARGIN)
    hits, misses, false = int((flood & alert).sum()), int((flood & ~alert).sum()), int((~flood & alert).sum())
    nse = []
    for _, g in x.groupby("gauge_id"):
        spread = ((g.observed_m3s - g.observed_m3s.mean()) ** 2).sum()
        if spread > 0:
            nse.append(1 - ((g.observed_m3s - g[column]) ** 2).sum() / spread)
    return {"flood_days": hits + misses, "caught": round(hits / max(1, hits + misses), 3), "false_share": round(false / max(1, hits + false), 3), "median_nse": round(float(np.median(nse)), 3)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--camels", type=Path, required=True)
    parser.add_argument("--saved", type=Path, required=True)
    parser.add_argument("--q95", type=Path, required=True)
    args = parser.parse_args()

    archive = zipfile.ZipFile(args.camels)
    gauges = pd.read_csv(MODEL_DIR / "graph_edges.csv", dtype=str)
    ensemble_ids = sorted(set(gauges.source) | set(gauges.target))
    build_points(archive, ensemble_ids)

    ensemble = Ensemble()
    ids = ensemble.gauge_ids
    saved = pd.read_parquet(args.saved)
    saved["gauge_id"] = saved.gauge_id.astype(str)
    q95 = pd.read_csv(args.q95, dtype={"gauge_id": str}).set_index("gauge_id").q95

    camels = load_camels(archive, ids)
    starts = pd.DatetimeIndex(sorted(saved.sample_date.unique()))
    mine = run_windows(ensemble, camels.index, cube(camels, ids), starts[::7])
    joined = saved.merge(mine, on=["sample_date", "lead_day", "gauge_id"])
    relative = (joined.flow - joined.predicted_m3s).abs() / joined.predicted_m3s.clip(lower=1)
    print(f"\n1. REPRODUCTION on CAMELS weather, {len(joined):,} forecasts: median relative difference {relative.median():.2e}, "
          f"99th percentile {relative.quantile(.99):.2e}, max {relative.max():.2e}, correlation {np.corrcoef(np.log1p(joined.flow), np.log1p(joined.predicted_m3s))[0, 1]:.8f}")
    if relative.quantile(.99) > 0.05:
        sys.exit("FAILED: the live code doesn't reproduce the saved forecasts.")

    weather = CatchmentWeather(ids)
    all_days, all_values = [], []
    for first, last in PERIODS:
        cache = WORK / f"openmeteo_{first}.npz"
        if cache.exists():
            data = np.load(cache, allow_pickle=False)
            days, values = pd.DatetimeIndex(data["days"]), data["values"]
        else:
            for attempt in range(6):
                try:
                    days, values = weather.fetch(ARCHIVE_URL, {"start_date": first, "end_date": last}, chunk_size=8, pause=25)
                    break
                except urllib.error.HTTPError as error:
                    if error.code != 429 or attempt == 5:
                        raise
                    print("Rate limited, waiting 5 minutes", flush=True)
                    time.sleep(300)
            np.savez_compressed(cache, days=days.to_numpy().astype("datetime64[D]").astype(str), values=values)
            time.sleep(1)
        all_days.append(days)
        all_values.append(weather.catchment_means(values))

    results, rain_ratio = [], []
    for days, values in zip(all_days, all_values):
        monsoon = pd.DatetimeIndex([d for d in days[WINDOW_DAYS:] if 6 <= d.month <= 10])
        live = run_windows(ensemble, days, values, monsoon)
        imd = run_windows(ensemble, camels.index, cube(camels, ids), monsoon).rename(columns={"flow": "imd"})
        merged = saved.merge(live, on=["sample_date", "lead_day", "gauge_id"]).merge(imd, on=["sample_date", "lead_day", "gauge_id"])
        results.append(merged)
        camels_rain = camels.loc[days].xs("prcp", axis=1, level=1)[ids].to_numpy()
        rain_ratio.append(np.nansum(values[..., 0], axis=0) / np.maximum(1, np.nansum(camels_rain, axis=0)))
    table = pd.concat(results, ignore_index=True)
    ratio = np.mean(rain_ratio, axis=0)
    print(f"\n2. RAIN, Open-Meteo total / CAMELS total per gauge: median {np.median(ratio):.2f}, range {ratio.min():.2f} to {ratio.max():.2f}")
    print("\n3. SKILL, June-October 2010 and 2012, lead days 2-4, same alert rule")
    print("   CAMELS weather (as trained):", score(table, "imd", q95))
    print("   Open-Meteo weather (live):  ", score(table, "flow", q95))
    agree = ((table.flow >= table.gauge_id.map(q95) * .9) == (table.imd >= table.gauge_id.map(q95) * .9)).mean()
    print(f"   Same alert decision as CAMELS weather on {agree:.1%} of gauge-days")
    corr = np.corrcoef(np.log1p(table.flow), np.log1p(table.imd))[0, 1]
    print(f"   Correlation of log flow with CAMELS-weather forecasts: {corr:.3f}")


if __name__ == "__main__":
    main()
