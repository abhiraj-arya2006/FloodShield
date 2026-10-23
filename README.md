# FloodShield: STG-Mamba (Phase 2)

FloodShield is an AI-based flood forecasting project for Indian river basins.
This repository holds **Phase 2**: a spatio-temporal graph + Mamba (STG-Mamba)
streamflow forecasting model, plus a live prediction backend and frontend for
the project review.

> **Status: scaffold only.** No model, data pipeline, graph code, backend
> endpoint or frontend has been implemented yet. No data has been downloaded.

## Methodology (three phases)

| Phase | Approach | Where |
|-------|----------|-------|
| 1 | XGBoost baseline | Separate repository (maintained separately) |
| 2 | **STG-Mamba primary forecasting** | **This repository** |
| 3 | XGBoost residual correction on STG-Mamba output | Planned separately (out of scope here) |

## Scope

- **Region:** India only. Two basins: **Godavari** and **Mahanadi**.
- **Time step:** daily.
- **Target:** observed river streamflow at gauge nodes.
- **Forecast horizon:** 1 to 3 days (**proposed**, not final).
- **Graph:** nodes = river gauges; edges = upstream to downstream links derived
  from the river network.
- **Inputs:** weather + static catchment attributes + graph. The model is
  weather-driven and does **not** use past observed flow as input, so no live
  gauge feed is needed for live predictions.

## Datasets

| Dataset | Role |
|---------|------|
| [CAMELS-IND](https://doi.org/10.5281/zenodo.14005378) | Observed daily streamflow (targets), gauge locations, static attributes, catchment boundaries |
| [HydroRIVERS](https://www.hydrosheds.org/products/hydrorivers) | River network for upstream/downstream graph edges |
| [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api) | Historical (ERA5-based) weather at each gauge for training |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Live recent + forecast weather for live predictions |

Which gauges in Godavari and Mahanadi have enough streamflow data is **not yet
verified**. See [docs/dataset_sources.md](docs/dataset_sources.md) for details,
licensing and limitations.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).

## Compute

Developed on an Apple M4 Pro (macOS arm64, no CUDA). PyTorch's **MPS** backend
(Apple GPU, float32) is the primary device; CPU is a logged fallback only.

## Setup

Requires Python 3.11.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e .
cp .env.example .env
```

## Run tests

```bash
source .venv/bin/activate
pytest
```

Only `tests/test_environment.py` runs real checks (imports, MPS availability,
a tiny float32 tensor op). All other tests are skipped placeholders.

## Layout

- `configs/`: YAML configs (placeholders with TODOs)
- `data/`: raw / processed / graph data (never committed)
- `src/floodshield/`: the Python package (stubs)
- `scripts/`: command-line entry points (stubs)
- `app/backend/`: FastAPI live-demo backend (placeholder)
- `app/frontend/`: frontend (stack to be decided)
- `docs/`: dataset sources, model architecture, live demo plan
