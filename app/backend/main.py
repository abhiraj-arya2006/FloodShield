"""FastAPI application entry point for the live demo (placeholder).

No endpoints are defined yet. Routes will serve cached model forecasts
(see app/backend/routes.py and docs/live_demo_plan.md); nothing here returns data.
"""

from fastapi import FastAPI

app = FastAPI(title="FloodShield STG-Mamba (placeholder)")

# TODO: include the router from app.backend.routes once implemented.
# TODO: start the forecast refresh scheduler on startup (app.backend.scheduler).
