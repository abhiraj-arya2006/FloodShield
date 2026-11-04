# STG-Mamba model architecture

> **Implemented and trained; scored on validation only** (`src/floodshield/models/`,
> `metrics/stg_mamba_val_metrics.json`). All sizes are PROPOSED settings in
> `configs/model.yaml`. XGBoost correction (item 6) is not implemented.

## Concept

1. **Inputs per gauge node:**
   - a past window of daily weather (`window_days`, proposed 90) from the
     CAMELS-IND forcings: `feature_list` (default prcp, tmax, tmin, tavg from IMD);
   - future rain for the forecast days (`horizon_days`, proposed 4). In
     training this is observed IMD rain as a stand-in for a forecast
     (`configs/training.yaml` `future_rain.mode`); live it will be forecast rain;
   - static catchment attributes from CAMELS-IND (none derived from streamflow).
2. **Weather-driven:** no past observed streamflow is an input.
3. **Graph step:** information is propagated along directed upstream to
   downstream edges between gauges (from HydroRIVERS, `configs/graph_edges.csv`),
   so a downstream gauge sees the conditions of its upstream catchments.
   Implemented with plain-torch adjacency matrices (no torch-geometric).
4. **Temporal blocks:** Mamba (selective state space) blocks model the
   temporal dynamics. Pure-PyTorch implementation, no CUDA kernels.
5. **Output:** daily streamflow per gauge for days t+1..t+4 (log1p, then
   standardised per gauge with training-period statistics).
6. **Phase 3:** XGBoost trained on STG-Mamba's errors corrects systematic biases.

Training uses a masked loss so days with missing observed streamflow are
ignored; missing targets are never filled.

## Implementation notes

- Static features are projected and **added** to every step's projected input.
- Each gauge's sequence has 94 steps (90 past + 4 future). On future steps the rain channel
  holds `x_future`, other weather channels are 0 (standardised mean), `is_future` = 1.
- `model.decoder` selects how leads are produced. `last_step` (default): the hidden state at the
  last step is the gauge embedding and one head maps it to all 4 leads, so every lead sees rain up
  to t+4. `per_lead`: the hidden state at step t+k decodes lead k through a shared head, so lead k
  sees rain only up to t+k; graph layers run separately per lead.
- One-seed validation comparison of the two decoders: `metrics/stg_mamba_val_metrics.json` and
  `metrics/stg_mamba_perlead_val_metrics.json`. `per_lead` removes the decay across leads but
  under-predicts high flows more, so `last_step` stays the default for now.
- `scripts/train.py --high-flow-weight W` weights days above the gauge's warning threshold in the
  training and validation loss, so validation losses are not comparable across weights. One-seed
  validation results at `per_lead` W = 5 and 10: `metrics/stg_mamba_perlead_hf5_val_metrics.json`
  and `metrics/stg_mamba_perlead_hf10_val_metrics.json`.
- Three-seed validation comparison (seeds 42, 1, 2; per lead and seed, median across gauges, flood
  scores pooled): `metrics/seed_comparison_val.csv`. `peak` is predicted over observed flow on each
  gauge's 10 largest observed days; `errtop` and `errrest` are the mean log1p error on days above
  and below each gauge's validation q90. Seed-to-seed spread exceeds the decoder difference, so
  config defaults are unchanged.
- `scripts/evaluate.py --run-name NAME --members RUN1 RUN2 RUN3` scores the mean of several
  checkpoints' predictions in standardised log1p space. Three-seed validation ensembles:
  `metrics/ens_perlead_hf5_val_metrics.json`, `ens_perlead_hf10_val_metrics.json` and
  `ens_laststep_hf5_val_metrics.json`.
- SSM step size delta uses the original Mamba initialisation (log-uniform in
  [`dt_min`, `dt_max`]); a simpler init forgot the input within a few steps.

## Compute notes

- **Primary device is MPS** (Apple GPU), float32 only; CPU is a logged fallback.
- The selective scan is currently **sequential** over the 94 steps, which is acceptable at
  about 150 s per epoch (`metrics/step2_benchmark.json`). A parallel or chunked scan is
  an optional later optimisation.
- Process all gauge nodes of both basins as one batch dimension so the GPU
  receives large tensors.
- Keep data resident on the GPU to avoid host/device transfers.
- Do not rely on `torch.compile` on MPS.
- Benchmark: `python scripts/train.py --benchmark` compares MPS and CPU.
