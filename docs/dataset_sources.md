# Dataset sources

> **Status:** CAMELS-IND and HydroRIVERS are downloaded into `data/raw/` and
> verified by `scripts/download_data.py`. Gauges are selected by
> `scripts/select_gauges.py` (`configs/selected_gauges.csv`). Model inputs are
> the CAMELS-IND catchment-mean forcings (`scripts/build_forcing_table.py`).
> Live data sources are researched in `docs/live_data_options.md`; none is
> implemented. No graph has been built. **Open-Meteo is not used.**

## 1. CAMELS-IND (v2.2)

- **Provider:** CAMELS-IND authors (Mangukiya, Kumar et al.; IIT Roorkee and IISc
  Bangalore); hosted on Zenodo.
- **URL / DOI:** dataset https://zenodo.org/records/14999580 (v2.2);
  paper https://doi.org/10.5194/essd-17-461-2025
- **Files used:**
  - `CAMELS_IND_Catchments_Streamflow_Sufficient.zip` (md5 `3993c25ba7d7b86df0541de91e094f39`, 178,141,731 bytes)
  - `00_CAMELS_IND_Data_Description.pdf` (md5 `19cf924c9a0a5417163ba773432ac274`)
- **Provides:**
  - `attributes_csv/` (also `attributes_txt/`, `;`-separated): static attributes
    in 8 files: `anth`, `clim`, `geol`, `hydro`, `land`, `name`, `soil`, `topo`.
    - `camels_ind_name.csv`: `gauge_id, ghi_stn_id, cwc_site_name, river_basin, cwc_river, ghi_group, flow_availability`
    - `camels_ind_topo.csv`: `gauge_id, cwc_lat, cwc_lon, ghi_lat, ghi_lon, elev_*, slope_*, cwc_area, ghi_area, gauge_elevation, dpsbar`
    - `camels_ind_anth.csv` dam columns: `num_dams, n_dams, res_store_sum, total_storage, reservoir_index, first_dam_year, last_dam_year`
      (the PDF calls the last one `latest_dam_year`).
  - `streamflow_timeseries/streamflow_observed.csv`: observed daily streamflow
    (sourced from India-WRIS), the model target.
  - `catchment_mean_forcings/<gauge>.csv`: 19 daily catchment-mean forcings,
    the model inputs (section 2).
  - `shapefiles_catchment/`: `gauge_stations.shp` (points) and `catchments.shp`
    (polygons), both EPSG:4326, 242 features each.
  - Also in the zip, **not used**: `streamflow_timeseries/lstm_pred_streamflow.csv`
    (the authors' LSTM model predictions, not observations).
- **Streamflow format:** columns `year, month, day`, then one column per gauge
  (header = gauge ID). Values are in **m3/s** (Data Description PDF, section 3).
  Missing days are blank cells; no sentinel values and no negative values were found.
- **Type:** observed (streamflow); gridded observations and reanalysis (forcings).
- **Time coverage:** files span 1980-01-01 to 2020-12-31 (verified: 14,976
  contiguous daily rows), but see the limitations below for where streamflow
  observations actually stop.
- **Licence / attribution:** CC BY 4.0 (Zenodo record). `Disclaimer.txt` asks
  users to cite the CAMELS-IND data description article and the original data
  sources where required.
- **Gauge IDs:** 5 digits; first 2 = CWC basin code, last 3 = station number
  (PDF, Table 3).
  - **Zero-padding:** the CSVs store `gauge_id` as an integer, so the leading
    zero is lost (`3002`, while the forcing file is `03002.csv`). Always read
    IDs as strings and zero-pad them to 5 digits.
- **Basins in scope (verified):**

  | Basin | CWC code | Gauges in subset | `flow_availability` % (min / median / max) |
  |---|---|---|---|
  | Godavari | `03` | 50 | 30.9 / 73.9 / 95.2 |
  | Mahanadi | `08` | 19 | 71.0 / 94.4 / 95.6 |

  Method: zero-pad `gauge_id`, take the first 2 digits, cross-tabulate with the
  `river_basin` column (each prefix maps to exactly one basin). The name file,
  the streamflow column headers and the forcing file names contain the same 242 IDs.
- **Known limitations and discrepancies:**
  - For Godavari and Mahanadi, observed streamflow mostly ends in Feb-Mar 2019;
    only 14 of the 69 gauges have any data in 2020. There is no recent observed
    flow for validating live forecasts.
  - Many Godavari gauges share a data gap around 2014-2015 (roughly mid-2014 to
    mid-2016). The train/validation/test split in `configs/training.yaml`
    (1991-2008 / 2009-2012 / 2013-2018) was chosen after inspecting this coverage.
  - Many gauges have other gaps (the subset keeps gauges with more than 30%
    availability over 1980-2020).
  - Large dams and reservoirs regulate flows in both basins (e.g. Hirakud on the
    Mahanadi), so observed flow is not purely natural and a weather-driven model
    will not capture reservoir operations.
  - The PDF says the subset has 228 catchments; the v2.2 zip actually contains **242**.
  - The PDF refers to `shapefile_catchment` and `change_logs_and_disclaimer.txt`;
    the zip has `shapefiles_catchment/` and `Disclaimer.txt`.

## 2. CAMELS-IND catchment-mean forcings (model inputs)

All 46 selected gauges have the same 19 columns, continuous daily
1980-01-01 to 2020-12-31. Catchment means are "area-weighted averages for each
day" (paper, section 4).

| Column | Unit | Original source |
|---|---|---|
| prcp | mm/day | IMD gridded rainfall, 0.25° (Pai et al., 2014) |
| tmax, tmin | C | IMD gridded temperature, 1° (Srivastava et al., 2009) |
| tavg | C | (tmax + tmin) / 2 |
| srad_lw, srad_sw | w/m2 | IMDAA reanalysis, ~12 km (Rani et al., 2021) |
| wind_u, wind_v, wind | m/s | IMDAA (wind stated as sqrt(u² + v²)) |
| rel_hum | % | IMDAA |
| evap_canopy, evap_surface | mm/day | IMDAA |
| sm_lvl1..4 | kg/m2 | IMDAA (layers 0-0.1, 0.1-0.35, 0.35-1, 1-3 m) |
| pet | mm/day | Singer et al. (2021), 0.1°, ERA5-Land based (from 1981) |
| pet_gleam, aet_gleam | mm/day | GLEAM (Miralles et al., 2011) |

Not stated in the PDF or paper: the day boundary, how IMDAA hourly fields were
aggregated to days, and the GLEAM version. Data anomalies (e.g. tmin = 0.00 C
at every gauge on 2019-01-11) are listed in `docs/live_data_options.md`.

## 3. HydroRIVERS (v1.0, Asia)

- **Provider:** HydroSHEDS (WWF and partners).
- **URL:** https://www.hydrosheds.org/products/hydrorivers
- **File used:** `HydroRIVERS_v10_as_shp.zip`
  (https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip,
  90,510,995 bytes; no checksum is published, so it is verified by size and zip integrity).
- **Provides:** `HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as.shp`, with 1,428,959
  river-reach LineStrings in EPSG:4326. Fields: `HYRIV_ID, NEXT_DOWN, MAIN_RIV,
  LENGTH_KM, DIST_DN_KM, DIST_UP_KM, CATCH_SKM, UPLAND_SKM, ENDORHEIC, DIS_AV_CMS,
  ORD_STRA, ORD_CLAS, ORD_FLOW, HYBAS_L12`. `NEXT_DOWN` gives the downstream
  reach, which is used to derive upstream to downstream edges. The technical
  documentation (`HydroRIVERS_TechDoc_v10.pdf`) is included.
- **Type:** derived static dataset (from HydroSHEDS elevation data), not a time series.
- **Licence / attribution:** HydroSHEDS licence (free for scientific, educational
  and commercial use; attribution required). The download page states that
  downloading means accepting the licence. Cite Lehner and Grill (2013),
  https://doi.org/10.1002/hyp.9740.
- **Time coverage:** static (no time dimension).
- **Known limitations:** gauge coordinates must be snapped to the network;
  snapping errors or coarse resolution can create wrong or missing edges, so the
  graph needs validation (`src/floodshield/graph/validation.py`).

## 4. Live data (researched, not implemented)

See `docs/live_data_options.md`. Summary:

- **IMD real-time gridded rainfall and temperature** (via `imdlib` 0.4.0,
  pinned in `requirements.txt`): verified working without login on
  2026-10-27; 1-2 day lag; rainfall on the same 0.25° grid as the archive,
  temperature on 0.5° (archive 1°). Data-use terms not found.
- **NCMRWF RDS (IMDAA):** all CAMELS IMDAA variables exist, but only as a
  reanalysis archive ending 2020; login and CC-BY acceptance required.
- **IITM / NCMRWF THREDDS (NCUM forecasts):** unreachable from here on 2026-10-27.
- **GLEAM:** yearly releases only; no near-real-time product.

## Considered, not used

| Source | Reason |
|--------|--------|
| Open-Meteo (Archive and Forecast APIs) | Dropped by project decision: inputs now come from the CAMELS-IND forcings (IMD/IMDAA) and Indian live sources. A Phase A plan (ERA5 cells, `scripts/plan_open_meteo_fetch.py`, `configs/data.yaml` `open_meteo` block) is kept for reference; no bulk data was fetched (one 31-day test request only). |
| NASA GPM IMERG | Needs Earthdata login and raster processing; not the source of the CAMELS rainfall. |
| Copernicus ERA5-Land (direct download) | CDS account plus NetCDF/GRIB handling; not the source of the CAMELS forcings. |
| GloFAS | Simulated discharge from another model, not observations; unsuitable as a target. |
| India-WRIS (direct download) | CAMELS-IND already packages India-WRIS streamflow in a curated, documented form. |
| Global Flood Database | Satellite flood-extent events, not daily streamflow at gauges. |
