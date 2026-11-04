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
  - `WARNING`: Predicted flow $\ge q95 \times (1 + \text{alert\_margin})$
  - `WATCH`: Predicted flow $\ge q90 \times (1 + \text{alert\_margin})$ and $< q95 \times (1 + \text{alert\_margin})$
  - Configurable via `configs/river_alert_policy.yaml`. The dashboard's replay demo reads `configs/app_flow_thresholds.csv`; the training pipeline uses `configs/flow_thresholds.csv` (real CAMELS-IND gauges).

---

## Datasets & Lineage

| Dataset | Role | Attribution / Citation |
|---|---|---|
| [CAMELS-IND](https://doi.org/10.5281/zenodo.14005378) | Daily streamflow observations (India-WRIS), gauge coordinates, static catchment attributes | doi:10.5281/zenodo.14005378 |
| [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers) | Upstream/downstream topological river network edges | HydroSHEDS / WWF |
| [Open-Meteo Historical Weather (Archive)](https://open-meteo.com/en/docs/historical-weather-api) | Historical reanalysis meteorological forcings (ERA5) | Open-Meteo.com (CC BY 4.0) |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Numerical weather prediction forcings for live forecasts | Open-Meteo.com (CC BY 4.0) |

---

## Data Generation & Git-Ignored Artifacts

To prevent committing large binary datasets into git, the 2009–2012 validation replay dataset is generated locally:

```bash
# Generates app/backend/data/replay_predictions.parquet, gauges.json, edges.json, configs
python scripts/generate_river_data.py
```

*Note: `app/backend/data/*.parquet` is excluded from git in `.gitignore`.*

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

1. **Live Weather Ingestion Pipeline**: Real-time periodic pulling from Open-Meteo Forecast API (`app/backend/scheduler.py`).
2. **Phase 3 XGBoost Residual Correction Stage**: Secondary tabular stage correcting STG-Mamba peak errors.
3. **Automated CAP/SMS Dispatch Gateway**: Actual transmission to district disaster authorities (currently strictly simulated for research integrity).
4. **Full Multi-Language Devanagari Translation strings**: The i18n infrastructure (`EN | HI`) and font loading are active; comprehensive dictionary expansion for regional Indian dialects (Telugu, Odia, Marathi) is planned.

---

## Model Development Pipeline (STG-Mamba training)

This section was merged in from the model-training repository (`ayushdheer4-del/floodshield`). It contains the real
STG-Mamba implementation under `src/floodshield/`, the training and evaluation scripts, and the saved metrics in `metrics/`.
Trained weights (`checkpoints/*.pt`) are git-ignored and are **not** in this repository; see `checkpoints/` for where they go.

### Compute

Developed on an Apple M4 Pro (macOS arm64, no CUDA). PyTorch's **MPS** backend
(Apple GPU, float32) is the primary device; CPU is a logged fallback only.

### Setup

Requires Python 3.11.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e .
cp .env.example .env
```

### Data preparation

```bash
python scripts/download_data.py   # CAMELS-IND + HydroRIVERS into data/raw/ (verified, re-runnable)
python scripts/select_gauges.py   # writes configs/selected_gauges.csv and outputs/gauge_selection_report.csv
python scripts/build_forcing_table.py   # all CAMELS forcings for the selected gauges -> data/processed/
python scripts/build_graph.py           # river graph -> data/graph/, configs/graph_edges.csv
python scripts/build_training_data.py   # windows, normalisers, thresholds -> data/processed/training/
python scripts/train.py                 # train on 1991-2008, early stopping on validation
python scripts/evaluate.py              # validation metrics, baselines, outputs/val_predictions.parquet
```

### Run ML tests

```bash
source .venv/bin/activate
pytest
```

Tests cover the environment (imports, MPS), data loading and gauge selection, river graph,
leakage safety, the Mamba block, graph layer, masked loss and the test-split guard.
`tests/test_inference.py` is still a skipped placeholder.

### Repository layout

- `configs/`: YAML configs and the selected gauge list
- `data/`: raw / processed / graph data (never committed)
- `src/floodshield/`: the Python package
- `scripts/`: command-line entry points
- `app/backend/`: FastAPI dashboard backend (replay mode)
- `app/frontend/`: React + Vite dashboard
- `backend/`, `ml/`, `config/`: earlier XGBoost-baseline FastAPI service and its simulation configs
- `metrics/`: saved training / validation / final-test metrics for the STG-Mamba runs
- `docs/`: dataset sources, model architecture, live demo plan
