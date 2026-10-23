# data/

| Directory | Purpose |
|-----------|---------|
| `raw/camels_ind/` | Unmodified CAMELS-IND files (manual download from Zenodo) |
| `raw/hydrorivers/` | Unmodified HydroRIVERS shapefiles (manual download) |
| `raw/open_meteo/` | Raw Open-Meteo archive responses, as fetched |
| `processed/` | Cleaned, aligned, model-ready tables derived from `raw/` |
| `graph/` | Generated gauge graph (node list, edge list, adjacency) |

Large datasets and generated artifacts are **never committed**. Only the
`.gitkeep` placeholders and this README are tracked (see `.gitignore`).
Everything here must be reproducible from the scripts in `scripts/`
plus the documented manual downloads in `docs/dataset_sources.md`.
