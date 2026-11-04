# Live data options for the CAMELS-IND forcings

> **Status:** research only (checked 2026-10-27). Nothing here is
> implemented. "Verified" means checked against a real response or the
> provider's own page/code during this check; everything else is marked
> unverified. Open-Meteo is **not used** (see `docs/dataset_sources.md`).

The model is trained on CAMELS-IND catchment-mean forcings
(`data/processed/camels_forcings_selected.parquet`, built by
`scripts/build_forcing_table.py`). A live forecast needs the **same variables
from the same (or a closely matching) source**, averaged over the same
catchments. This page maps every CAMELS forcing column to its best live
candidate.

## 1. What the CAMELS forcings are

From the Data Description PDF (Table 1) and the CAMELS-IND paper
(Mangukiya et al., 2025, ESSD 17, 461-491, section 4):

| Column | Unit (file header) | Source | Grid | Derivation stated |
|---|---|---|---|---|
| prcp | mm/day | IMD gridded rainfall (Pai et al., 2014) | 0.25° | catchment area-weighted daily mean |
| tmax, tmin | C | IMD gridded temperature (Srivastava et al., 2009) | 1° | as above |
| tavg | C | derived | | (tmax + tmin) / 2 (verified in data) |
| srad_lw, srad_sw | w/m2 | IMDAA reanalysis (Rani et al., 2021) | ~12 km | daily from hourly: method **not stated** |
| wind_u, wind_v | m/s | IMDAA, 10 m | ~12 km | **not stated** |
| wind | m/s | stated as sqrt(u² + v²) | | **not** the norm of the daily u, v: it is always ≥ it (by up to 3.9 m/s), consistent with averaging sub-daily speeds (inference) |
| rel_hum | % | IMDAA, 2 m | ~12 km | **not stated** |
| evap_canopy, evap_surface | mm/day | IMDAA | ~12 km | **not stated** |
| sm_lvl1..4 | kg/m2 | IMDAA, layers 0-0.1 / 0.1-0.35 / 0.35-1 / 1-3 m | ~12 km | **not stated** |
| pet | mm/day | Singer et al. (2021) hourly PET from ERA5-Land | 0.1° | from 1981 (1980 is empty) |
| pet_gleam, aet_gleam | mm/day | GLEAM (Miralles et al., 2011) | | GLEAM version **not stated** |

The day boundary (which 24 hours make up a date) is **not stated** for any
variable in the PDF, the paper, or the IMD gridded-rainfall page.

## 2. Mapping to live candidates

| CAMELS column | Best live candidate | Verified? | Match quality | Latency | Access | Main risks |
|---|---|---|---|---|---|---|
| prcp | IMD real-time gridded rainfall via `imdlib` (`rain`) | **Verified** (fetched 2026-10-26 grid) | Same producer and same 0.25° grid (135 × 129) as the archive used by CAMELS | 1 day (2026-10-26 available on 2026-10-27; 2026-10-27 not yet) | No login; HTTP POST to imdpune.gov.in | Real-time files are provisional (per imdlib docs) and based on fewer gauges than the final archive; day boundary unverified |
| tmax | IMD real-time `tmax` via `imdlib` | **Verified** (2026-10-25 grid) | Same producer, but **0.5° grid (61 × 61)** live vs **1° (31 × 31)** archive | 2 days | No login | Resolution mismatch changes catchment means, especially for small catchments |
| tmin | IMD real-time `tmin` via `imdlib` | **Verified** (2026-10-26 grid) | As tmax | 1 day | No login | As tmax |
| tavg | (tmax + tmin) / 2 from the live tmax, tmin | Formula verified in CAMELS data | Exact, given tmax/tmin | as tmax | | inherits tmax/tmin issues |
| srad_lw, srad_sw, wind_u, wind_v, wind, rel_hum, evap_canopy, evap_surface, sm_lvl1..4 | NCMRWF IMDAA (RDS) | Variables **verified** in the RDS download form; **no live product found** | Same model family, but RDS IMDAA ends 2020 (title "1979 to 2020"; the hourly form's year list goes to 2022) | none (reanalysis archive) | Free account login; accept CC-BY licence; queued jobs (dashboard average 41 min per job) | No IMDAA-like product after 2020/2022 is listed on RDS; NCMRWF "Operational Analyses" are mentioned on the RDS home page but no dataset is listed |
| (same IMDAA columns) | NCMRWF NCUM forecast via IITM THREDDS (`ardc.tropmet.res.in/thredds`) | **Unverified**: host refused connections on ports 80 and 443 (DNS resolves to 103.251.184.53) | Unknown | Unknown | Unknown | Could be down or restricted to some networks; must be re-checked |
| pet | Recompute from live variables (see section 4) | Formula only | Hargreaves PET vs CAMELS pet (1981-2020, 46 gauges): median daily r 0.86, monthly r 0.93, bias +19.6% (range +8.8 to +28.4%) | as tmax | | Different method from CAMELS pet; train on the recomputed PET to avoid a shift |
| pet_gleam | none live | GLEAM site **verified**: updated once a year (around April) | | GLEAM4.3a ends 2024-12-31; GLEAM4.3b ends end of 2025 | SFTP account required | Hargreaves PET vs pet_gleam bias +70.6% (median) |
| aet_gleam | none live | as above | | as above | as above | No live analogue; recommend dropping |

### Details checked

**IMD real-time (imdlib 0.4.0, MIT licence, PyPI, uploaded 2026-10-19).**
`imdlib.get_real_data(var, day)` POSTs the date to
`https://imdpune.gov.in/cmpg/Realtimedata/Rainfall/rain.php`,
`.../max/max.php` and `.../min/min.php` and saves one binary `.grd` file per
day (rain 69,660 B; temperature 14,884 B). An empty reply means the day is
not published yet. Test on 2026-10-27:

| Variable | Latest day | Grid | Valid cells | Range | Units (imdlib attrs) |
|---|---|---|---|---|---|
| rain | 2026-10-26 | 0.25°, lat 6.5-38.5, lon 66.5-100.0 | 4,964 | 0.00 to 110.12 | mm/day |
| tmax | 2026-10-25 | 0.5°, lat 7.5-37.5, lon 67.5-97.5 | 1,393 | 13.98 to 38.07 | C |
| tmin | 2026-10-26 | 0.5°, lat 7.5-37.5, lon 67.5-97.5 | 1,393 | 0.29 to 25.95 | C |

- **Provisional:** the files carry no provisional flag; imdlib's docstring calls
  them "provisional daily files". IMD's own statement was not found.
- **Day boundary:** not stated on the IMD gridded-rainfall page or in Pai et
  al. (2014). The common understanding (24 h ending 08:30 IST, 03 UTC) is
  **unverified**.
- **Terms:** the IMD page asks users to cite Pai et al. (2014) and carries a
  disclaimer (no guarantee of correctness, no liability). No licence or
  real-time data-use policy was found. **You should confirm IMD's data policy
  before using real-time data in a public demo.**
- The IMD archive page lists yearly rainfall files up to 2025 (text: 1901-2024).

**NCMRWF RDS (rds.ncmrwf.gov.in).** Catalogue: IMDAA hourly single levels,
daily single level, 3-hourly pressure levels (all "1979 to 2020"); NGFS
reanalysis (1999-2018); S2S reforecast (1993-2015); MERA hourly rainfall
(2020-2025); NEMO ocean analysis (2016-2026). The IMDAA daily product has only
precipitation and surface temperature (mean/max/min). The hourly single-level
form lists every CAMELS IMDAA variable (downward surface LW flux, total
downward surface SW flux, 10 m U/V wind, 2 m relative humidity, evaporation
from canopy and soil surface, soil moisture levels 1-4), hourly 00:00-23:00
(time zone not stated), NetCDF4 ("Experimental"), ZIP download. To get
CAMELS-like daily values you would aggregate the hourly fields to days and
area-average per catchment; the exact CAMELS aggregation is not documented.

**What you must do to use RDS:** create a free account at
https://rds.ncmrwf.gov.in/login and accept the CC-BY licence on the download
form. Cite DOI 10.64349/nmrf.rds.imdaa.50515 (hourly) or
10.64349/nmrf.rds.imdaa.50514 (daily). Read the site's Terms page (not read
here).

**GLEAM (gleam.eu).** Current version GLEAM4 (0.1°, daily). "Datasets are
typically updated and extended once a year, and are generally released around
April." Download is via SFTP (port 2225) with credentials. No near-real-time
product.

## 3. Recommendation

1. **Live-capable feature set (default in `configs/model.yaml` `feature_list`):**
   prcp, tmax, tmin, tavg from IMD. Same producer for training and live.
2. Optionally add **PET recomputed by one formula** for both training and live
   (section 4), instead of CAMELS `pet` / `pet_gleam`.
3. Keep the IMDAA and GLEAM columns for offline experiments only
   (`feature_list_all_camels`) until a live source is verified.
4. Drop `aet_gleam` from any live model.

## 4. PET from live variables

**Hargreaves-Samani (FAO-56 eq. 52)**, needs only tmax, tmin and latitude:

    ET0 = 0.0023 * 0.408 * Ra * (Tmean + 17.8) * sqrt(Tmax - Tmin)      [mm/day]

with Ra the extraterrestrial radiation (MJ m-2 day-1) from latitude and day of
year (FAO-56 eq. 21). Comparison with CAMELS over 1981-2020 for the 46
selected gauges (2019-01-11 excluded, see below):

| Reference | Daily r (min / median / max) | Monthly r (median) | Bias (median, range) |
|---|---|---|---|
| CAMELS pet (Singer et al.) | 0.75 / 0.86 / 0.91 | 0.93 | +19.6% (+8.8 to +28.4%) |
| CAMELS pet_gleam | 0.72 / 0.76 / 0.81 | 0.85 | +70.6% (+53.5 to +75.8%) |

Mean daily values: Hargreaves 4.90, pet 4.10, pet_gleam 2.89 mm/day. The two
CAMELS PET columns also disagree (pooled daily r 0.84).

**FAO-56 Penman-Monteith** would need net radiation, 2 m wind, humidity and
pressure, which have no verified live source (they are IMDAA-only).

To avoid a training/live shift, compute the same PET formula from the CAMELS
tmax/tmin for training and from live IMD tmax/tmin for inference.

## 5. The horizon problem

- Live IMD observations lag by **1 day (rain, tmin) to 2 days (tmax)**. On
  day D the newest complete input is D-1 or D-2.
- A model trained on observed inputs up to day t that predicts t+1..t+3 will,
  live, effectively forecast from D-2, so a "3-day" forecast reaches only
  about D+1.
- Future rain is the main flood driver within 1-3 days. Without a rainfall
  forecast the model can only use routing of rain already fallen. Feeding
  NWP forecast rain live while training on observed IMD rain creates a
  mismatch (forecast rain is biased and smoother than observed), and no
  forecast source has been verified here (the THREDDS server was
  unreachable).
- Options: (a) train on observed inputs only and report the effective lead
  time honestly; (b) train with observed future rain as a "perfect forecast"
  upper bound and treat live results as optimistic; (c) train on archived
  forecasts or reforecasts (none verified; RDS S2S reforecast covers only
  1993-2015).

## 6. Data anomalies found in the CAMELS forcings (46 gauges)

Reported by `scripts/build_forcing_table.py`; nothing was changed:

- `tmin` is exactly 0.00 C at **all 46 gauges on 2019-01-11** while tmax is
  24-31 C: a bad source value; `tavg` for that day is wrong too.
- `wind` is exactly 0 with u = v = 0 on 2 gauge-days (03082 on 1985-12-19,
  03092 on 1981-09-13).
- `wind` differs from sqrt(u² + v²) on 449,607 of 688,896 gauge-days (always
  higher; see section 1).
- `evap_canopy` is negative on 9,489 gauge-days (minimum -0.25 mm/day), mostly
  November to February: plausible condensation/dew, not an error.
- `pet` is empty for 1980 (documented: "from 1981 to 2020").
