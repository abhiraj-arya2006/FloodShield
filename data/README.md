# data/

| Directory | Purpose |
|-----------|---------|
| `raw/camels_ind/` | Unmodified CAMELS-IND files (streamflow targets, catchment-mean forcings, attributes, shapefiles) |
| `raw/hydrorivers/` | Unmodified HydroRIVERS shapefiles |
| `raw/open_meteo/` | Considered, not used: Phase A planning files only (cell plan); no weather data |
| `processed/` | Cleaned, aligned, model-ready tables derived from `raw/` (e.g. forcings, normalisers) |
| `graph/` | Generated gauge graph (edge list, adjacency, snapping report) |

Large datasets and generated artifacts are **never committed**. Only the
`.gitkeep` placeholders and this README are tracked (see `.gitignore`).
Everything here must be reproducible from the scripts in `scripts/`
plus the documented downloads in `docs/dataset_sources.md`.
