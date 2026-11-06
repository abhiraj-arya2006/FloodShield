# FloodShield: STG-Mamba (Phase 2)

FloodShield is an India-specific AI river flood early-warning system for the **Godavari** and **Mahanadi** basins.
This repository holds **Phase 2**: a spatio-temporal graph + Mamba (STG-Mamba) streamflow forecasting model, plus an operational review dashboard and backend serving 46 river gauges (27 Godavari, 19 Mahanadi).

> **Disclaimer**: This is a research prototype. Flood alert levels indicate streamflow exceeding a gauge's own high-flow statistical baseline (q95), **NOT** an official flood stage declared by the Central Water Commission (CWC). Simulated alert dispatch only.

---

## Methodology (Three Phases)

| Phase | Approach | Where | Status |
|---|---|---|---|
| 1 | XGBoost baseline | Separate repository | Complete |
| 2 | **STG-Mamba primary forecasting & early-warning dashboard** | **This repository** | **Active & Implemented** |
| 3 | XGBoost residual correction stage on STG-Mamba output | Planned separately | Future Roadmap |

---

## Scope & Basins

- **Region:** India (Godavari & Mahanadi river basins).
- **Network:** 46 river gauges (27 in Godavari, 19 in Mahanadi) linked by 44 directed upstream-to-downstream topological river reaches.
- **Lead Horizons:**
  - **Lead Day 1:** Nowcast
  - **Lead Days 2, 3, 4:** Headline forecasts
- **Threshold Rules:**
  - `WARNING`: forecast flow >= q95 x (1 - alert_margin), with alert_margin = 0.10
  - `WATCH`: forecast flow >= q90 x (1 - alert_margin), below the warning level
  - Configurable via `configs/river_alert_policy.yaml` and `configs/flow_thresholds.csv`.

---

## Datasets & Lineage

| Dataset | Role | Citation |
|---|---|---|
| [CAMELS-IND v2.2](https://doi.org/10.5281/zenodo.14999580) | Daily streamflow, catchment-mean weather forcings (IMD, IMDAA, GLEAM), gauge locations, catchment attributes | doi:10.5281/zenodo.14999580 |
| [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers) | River network linking gauges upstream to downstream | HydroSHEDS / WWF |
| NASA Blue Marble | Earth imagery on the site | NASA Visible Earth |

---

## Loading the Model's Forecasts

The app serves the saved forecasts of the trained STG-Mamba ensemble (`ens_perlead_hf5`): validation years 2009-2012 and held-back test years 2013-2018. Forecasts and weights are large, so they aren't in git.

```bash
# --bundle holds outputs/ and checkpoints/ from training; --model-repo is a checkout of the model repository
python scripts/import_model_predictions.py --bundle <folder> --model-repo <folder>
```

This writes the forecasts plus the real gauges, river links and thresholds. It refuses to write anything unless the forecasts reproduce `metrics/final_test_results.csv` exactly.

These are replays using recorded rain for the four forecast days. Live forecasting (IMD observations plus forecast rain) is not built, and its skill will be lower.

---

## Live Forecasts

The app opens on a live forecast: `app/backend/live.py` runs the trained ensemble on 90 days of Open-Meteo weather plus 4 days of forecast rain, averaged over each real catchment, and refreshes every 3 hours. The Past button switches to the 2009-2018 replays.

The weather isn't what the model trained on, so live skill is lower. On 2012, using Open-Meteo's archive and a correction fitted on 2010, lead days 2-4 caught about 69% of flood days with 56% of alerts false and a median NSE of 0.32. The training weather scores 81%, 44% and 0.47 on the same days. Real forecast rain will score lower still.

To re-measure, download the CAMELS-IND zip, then run `scripts/validate_live_pipeline.py` and `scripts/fit_weather_correction.py`. The first also proves the live code reproduces the saved forecasts (median difference below 1e-6). Weather data by Open-Meteo.com (CC BY 4.0).

---

## Ask Panel

The Ask button answers questions from the forecast on screen. Common questions get built-in answers worked out from the data, with no API key. For open-ended questions, copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY`, and restart the backend. Each answer says which of the two produced it. The key stays on the server, and questions are limited to 20 a minute per client.

---

## How to Run

Install once:

```bash
pip install -r requirements.txt
npm --prefix app/frontend install
```

Then, from the project folder, one command starts the backend (port 8000) and, once it answers, the site (port 5173):

```bash
npm run dev
```

Open `http://localhost:5173/dashboard`. Ctrl+C stops both. If a FloodShield backend is already running on port 8000 it is reused, and an older one without live forecasts is reported instead of used. The site lives in `app/frontend`; there is no other frontend folder.

To run the two separately: `npm run backend` and `npm run site`. API documentation is at `http://127.0.0.1:8000/docs`.

```bash
npm test
npm run build
```

---

## How to Switch from Replay to Live Mode

The system uses a pluggable `DataSource` interface (`ReplaySource` vs `LiveSource`):

1. Open `configs/river_alert_policy.yaml`.
2. Change `data_mode`:
   ```yaml
   data_mode: "live" # Switch from "replay" to "live"
   ```
3. In `live` mode, endpoints will query the live inference pipeline.
   *Currently, because the live scheduler pipeline is planned for Phase 3, `LiveSource` cleanly returns `HTTP 501 Not Implemented` with an explanatory message rather than failing silently.*

---

## What Is Still Not Built

1. **Live Weather Ingestion Pipeline**: Periodic IMD observations plus forecast rain, as planned in the model repository's live demo notes (`app/backend/scheduler.py`).
2. **Phase 3 XGBoost Residual Correction Stage**: Secondary tabular stage correcting STG-Mamba peak errors.
3. **Automated CAP/SMS Dispatch Gateway**: Actual transmission to district disaster authorities (currently strictly simulated for research integrity).
4. **Full Multi-Language Devanagari Translation strings**: The i18n infrastructure (`EN | HI`) and font loading are active; comprehensive dictionary expansion for regional Indian dialects (Telugu, Odia, Marathi) is planned.
