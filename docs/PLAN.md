# FloodShield — Project Plan (Milestone 1)

## 1. Milestones Overview

- **Milestone 1 (Current Focus)**: Baseline Prototype for Delhi NCR
  - Deterministic simulation engine (scenarios, moving storms, topography, drainage, single source of truth feature table).
  - Programmatic grid generation (EPSG:32643 UTM 43N projected, served in EPSG:4326 WGS84).
  - RiskEngine with hysteresis + ExposureService for impact prioritization.
  - AlertService with state machine, cooldown, deduplication, audit log, and CAP-style schema.
  - Machine learning: Surrogate model + real XGBoost model trained on synthetic data (`scripts/train_synthetic.py`) with real SHAP `TreeExplainer` explanations.
  - FastAPI backend serving all `/api/*` contracts + typed WebSocket `/ws/live`.
  - Full React + Vite + TypeScript dashboard with Leaflet Canvas renderer, Recharts, Zone Intelligence, SHAP drawer, What-If counterfactual analysis, time slider/playback, and dedicated pages.
  - Comprehensive automated tests (`pytest`, `vitest`), linting, and documentation.
- **Milestone 2**: PostgreSQL/PostGIS + Alembic migrations, Docker Compose (stubs/interfaces in M1).
- **Milestone 3**: Real weather ingestion (Open-Meteo/IMD), Redis pub/sub (stubs/interfaces in M1).
- **Milestone 4**: Real geospatial preprocessing (Copernicus DEM, LULC, OSM) (stubs/interfaces in M1).
- **Milestone 5**: Real data training, spatial/temporal cross-validation, calibration.
- **Milestone 6**: Deep learning time-series (LSTM, GRU, Transformer).
- **Milestone 7**: Satellite SAR flood segmentation (Sentinel-1, U-Net).
- **Milestone 8**: Uncertainty estimation (ensembles, MC dropout), GNN/GAT spatial propagation.
- **Milestone 9**: Production deployment, MLflow tracking, drift monitoring, real alert channels.

---

## 2. Key Assumptions

1. **Simulation Safety**: All outputs are synthetic. Every API response has `is_simulated: true`, headers include `X-Simulation: true`, and all UI screens feature a persistent disclaimer banner.
2. **Deterministic Reproducibility**: Given a fixed seed, scenario, and simulation timestamp, the simulation engine produces bitwise identical spatial fields and feature tables.
3. **No External Infrastructure Required for M1**: Runs locally on Python 3.11+ and Node 18+ with zero external databases, API keys, GDAL binaries, or GPUs.
4. **Performance & Rendering**: Grid cell size defaults to 500 m (~9,000 cells) across Delhi NCR. Leaflet with the Canvas renderer handles this smoothly without client-side lag. Static geometries and dynamic values are fetched separately.
5. **Real XGBoost & SHAP on Synthetic Data**: Demonstrates full architectural plumbing and valid model cards while explicitly noting the data origin as synthetic.

---

## 3. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Large GeoJSON payload causing map lag | High | Send static geometries (`/api/zones`) once; deliver dynamic values as compact key-value dictionaries keyed by `zone_id` (`/api/flood-map`). Use Leaflet Canvas renderer. |
| Inconsistency between endpoints | High | Strictly enforce "Single Source of Truth": `SimulationEngine.get_feature_table(time)` generates one unified snapshot used by Map, Predictions, Risk, and Alerts. |
| Alert storm in severe scenarios | Medium | Spatial clustering of alerts, hysteresis in `RiskEngine`, and cooldown per zone in `AlertService`. |
| Dependency issues with GDAL/PostGIS | Low | Milestone 1 uses pure Python dependencies (`shapely`, `pyproj`, `numpy`, `pandas`) avoiding native C++ GDAL bindings. |
