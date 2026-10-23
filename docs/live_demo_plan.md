# Live demo plan

> **Everything here is planned.** None of it is implemented or running.

## Planned flow

1. **Scheduler** (APScheduler, `app/backend/scheduler.py`) periodically
   fetches recent + forecast weather for every selected gauge from the
   Open-Meteo Forecast API.
2. **Input window** is built from that weather plus static attributes, using
   the same preprocessing as training (`src/floodshield/inference/live_pipeline.py`).
3. **Model** runs on MPS (CPU fallback, logged) and produces 1 to 3 day
   streamflow forecasts per gauge (horizon proposed).
4. **Risk classes** are assigned from historical flow percentiles
   (`src/floodshield/inference/risk_thresholds.py`).
5. **Cache:** results are written as JSON (`app/backend/cache.py`).
6. **FastAPI** serves the cached JSON (`app/backend/routes.py`).
7. **Frontend** shows the basin selector, a gauge map coloured by risk, and
   per-gauge forecast charts, with "Weather data by Open-Meteo.com" in the footer.

## Fallback: replay a saved past monsoon event

If the network or Open-Meteo is unavailable during the review, the backend
serves a saved past monsoon event instead (archived weather inputs, model
output, and observed flow for comparison). It must be clearly labelled as a
replay in the UI, never presented as a live forecast.
