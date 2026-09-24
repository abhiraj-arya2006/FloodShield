# FloodGuard AI — Architecture & Design Decisions Log

This document records key design decisions, trade-offs, and defaults chosen during development.

---

## Decision 1: Spatial Grid & CRS Strategy
- **Context**: Delhi NCR coverage requires spatial projections that allow accurate metric computations (e.g. 500 m / 250 m cell sizes) while serving standard WGS84 GeoJSON to the web frontend.
- **Decision**: Grid generation and spatial metrics are computed in projected CRS **EPSG:32643 (UTM Zone 43N)**. Geometries are converted to **EPSG:4326 (WGS84)** for API serving and Leaflet rendering.
- **Rationale**: UTM 43N provides accurate metric distance calculations for Delhi NCR. EPSG:4326 is universally supported by web mapping clients without reprojection overhead.

---

## Decision 2: Static Geometry vs. Dynamic State Separation
- **Context**: Transmitting 9,000 polygon geometries on every simulation tick (e.g. every 1-5 seconds over WebSocket or polling) would saturate network bandwidth and cause frontend lag.
- **Decision**: Static zone geometries and metadata are fetched once via `GET /api/zones`. Time-varying state (flood probability, risk level, rainfall intensity, priority score) is fetched via `GET /api/flood-map` as a compact key-value object (`{ [zone_id]: { p: 0.82, r: "HIGH", rf: 45.2, ... } }`) or streamed over WebSocket.
- **Rationale**: Reduces payload size from ~5-10 MB per tick to <100 KB, ensuring instantaneous map rerendering at 60 fps.

---

## Decision 3: Single Source of Truth for Simulation
- **Context**: Discrepancies between map colors, zone intelligence values, SHAP explanations, and alerts would break scientific coherence and user trust.
- **Decision**: A central `SimulationEngine` maintains deterministic state. For any given `(scenario, timestamp)`, it produces a single, immutable feature table. All endpoints (map, zone, explanation, alerts, priorities) query this exact feature table.
- **Rationale**: Eliminates synchronization bugs and ensures absolute determinism across all API endpoints.

---

## Decision 4: Real XGBoost & SHAP on Synthetic Data
- **Context**: Milestone 1 runs without external data or GPUs, yet needs real ML explainability and model pipeline validation.
- **Decision**: Provide both a `SurrogateFloodModel` (deterministic physical logistic function) and a real `XGBoostFloodModel` trained on synthetic simulation data via `make train-synthetic`. Explanations use `shap.TreeExplainer` on the XGBoost model.
- **Rationale**: Demonstrates true ML and XAI engineering, ensures realistic feature contributions, and validates the model registry interface while transparently documenting `trained_on: synthetic`.

---

## Decision 5: Leaflet Canvas Renderer & Dark Mode Palette
- **Context**: Rendering thousands of interactive grid polygons in standard SVG DOM mode can cause frame drops.
- **Decision**: Use `L.canvas()` renderer in React-Leaflet with a colorblind-safe risk palette (Viridis/ColorBrewer inspired) and hatched outline patterns for `CRITICAL` risk.
- **Rationale**: Canvas renderer handles tens of thousands of shapes with zero DOM bloat. Colorblind safety ensures accessibility compliance.
