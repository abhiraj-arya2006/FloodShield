# Live demo plan

> **Everything here is planned.** None of it is implemented or running.
> Source research: `docs/live_data_options.md`.

## Planned flow

1. **Recent observed weather.** The scheduler (APScheduler,
   `app/backend/scheduler.py`) fetches the latest IMD real-time gridded
   rainfall, tmax and tmin with `imdlib` (**tested**: works without login;
   observed lag 1-2 days on 2026-10-27).
2. **Forecast rain.** Rain for the coming days comes from NASA GEOS-FP
   (**pending, not tested**: endpoint, variable, units and latency still to be
   verified).
3. **Catchment averaging.** Both are averaged over each CAMELS-IND catchment
   polygon, matching how the training forcings were built (area-weighted daily
   means), then transformed with the training-period normalisers.
4. **STG-Mamba** (one model for all 46 gauges, MPS with logged CPU fallback)
   takes the past window of observed weather, the forecast rain for the
   coming days and static catchment attributes, and predicts daily streamflow
   per gauge for the next **4 days**. It is weather-driven: no past observed
   streamflow is an input, so no live gauge feed is needed.
5. **XGBoost residual correction** (Phase 3): an XGBoost model trained on
   STG-Mamba's errors corrects its systematic flow biases.
6. **Alerts.** A gauge is flagged when its predicted daily flow exceeds its own
   high-flow threshold (`configs/flow_thresholds.csv`, from training-period
   percentiles). This is a daily model: warning time is counted to the start
   of the forecast day, it cannot resolve the hour, and "flood" means flow
   above the gauge's own threshold, not an official CWC warning level.
7. **Cache and API.** Results are written as JSON (`app/backend/cache.py`) and
   served by FastAPI (`app/backend/routes.py`).
8. **Frontend** shows the basin selector, a gauge map coloured by alert
   status, and per-gauge forecast charts, with the data sources credited.

## Known limitations

- Training uses the IMD archive and observed future rain as a stand-in for a
  forecast (`configs/training.yaml` `future_rain.mode: observed`); live uses
  provisional IMD real-time data and GEOS-FP forecast rain, so live skill will
  be lower than test-period skill.
- Live IMD temperature is on a 0.5° grid; the archive used for training is 1°.

## Fallback: replay a saved past monsoon event

If the network or a data source is unavailable during the review, the backend
serves a saved past monsoon event instead (archived inputs, model output, and
observed flow for comparison). It must be clearly labelled as a replay in the
UI, never presented as a live forecast.
