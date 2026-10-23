# STG-Mamba model architecture (intended concept)

> **Not implemented.** This describes the planned design only.

## Concept

1. **Input window:** for each gauge node, a window of daily weather (Open-Meteo
   variables, TBD) plus static catchment attributes from CAMELS-IND.
   Window length is TBD.
2. **Graph step:** information is propagated along directed upstream to
   downstream edges (from HydroRIVERS), so a downstream gauge sees the
   conditions of its upstream catchments. Implemented with plain-torch
   adjacency matrices (no torch-geometric).
3. **Temporal blocks:** Mamba (selective state space) blocks model the
   temporal dynamics. Pure-PyTorch implementation, no CUDA kernels.
4. **Output:** streamflow forecast per gauge for a horizon of 1 to 3 days
   (proposed).

Training uses a masked loss so days with missing observed streamflow are
ignored. Past observed flow is not an input.

## Compute notes (planned, not implemented)

- **Primary device is MPS** (Apple GPU), float32 only; CPU is a logged fallback.
- The Mamba selective scan must **not** run as one tiny GPU op per time step.
  Plan to use a parallel (associative) scan or a chunked scan.
- Process all gauge nodes of both basins as one batch dimension so the GPU
  receives large tensors.
- Keep the input window short (days to a few weeks) and keep data resident on
  the GPU to avoid host/device transfers.
- Do not rely on `torch.compile` on MPS.
- Once the model exists, benchmark MPS vs CPU on a tiny forward/backward pass
  and report the result.
