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

## Ask Panel

The Ask button answers questions from the forecast on screen. Common questions get built-in answers worked out from the data, with no API key. For open-ended questions, copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY`, and restart the backend. Each answer says which of the two produced it. The key stays on the server, and questions are limited to 20 a minute per client.

---

## How to Run the Backend

```bash
# Install Python dependencies
pip install -r requirements.txt
pip install pyarrow

# Run FastAPI backend (port 8000)
python -m uvicorn app.backend.main:app --host 127.0.0.1 --port 8000
```

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### Run Backend Automated Tests
```bash
pytest tests/test_river_api.py -v
```

---

## How to Run the Frontend

```bash
# Navigate to the frontend directory
cd app/frontend

# Install dependencies (if not already linked)
npm install

# Start Vite dev server (port 5173)
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Build Frontend for Production
```bash
cd app/frontend
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
