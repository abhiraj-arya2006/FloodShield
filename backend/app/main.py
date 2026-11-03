import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.simulation.engine import simulation_engine
from backend.app.alerts.service import alert_service
from backend.app.api import (
    health, zones, flood_map, predictions, weather, alerts,
    explanations, priorities, exposure, whatif, scenarios, simulation,
    satellite, models, websocket
)

# Initialize structured logging
setup_logging()

async def simulation_background_loop():
    """Periodic background runner broadcasting live ticks via WebSocket."""
    while True:
        try:
            await asyncio.sleep(2.0)
            if simulation_engine.clock.is_running:
                # Tick clock
                simulation_engine.clock.update()
                state = simulation_engine.get_state()
                
                # Broadcast state
                await websocket.manager.broadcast(
                    message_type="simulation_state",
                    payload=state.model_dump()
                )
        except asyncio.CancelledError:
            break
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background broadcaster
    bg_task = asyncio.create_task(simulation_background_loop())
    yield
    bg_task.cancel()
    try:
        await bg_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI-Based Urban Flood Early Warning System for Delhi NCR (Prototype Simulation)",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware enforcing X-Simulation header on every single response
@app.middleware("http")
async def simulation_header_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Simulation"] = "true"
    response.headers["X-Study-Region"] = "Delhi NCR"
    return response

# Standardized Error Handling (Section 24)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": str(exc),
            "details": "An unexpected error occurred in the simulation service.",
            "is_simulated": True
        },
        headers={"X-Simulation": "true"}
    )

# Register API routers
app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(zones.router, prefix=settings.API_V1_STR)
app.include_router(flood_map.router, prefix=settings.API_V1_STR)
app.include_router(predictions.router, prefix=settings.API_V1_STR)
app.include_router(weather.router, prefix=settings.API_V1_STR)
app.include_router(alerts.router, prefix=settings.API_V1_STR)
app.include_router(explanations.router, prefix=settings.API_V1_STR)
app.include_router(priorities.router, prefix=settings.API_V1_STR)
app.include_router(exposure.router, prefix=settings.API_V1_STR)
app.include_router(whatif.router, prefix=settings.API_V1_STR)
app.include_router(scenarios.router, prefix=settings.API_V1_STR)
app.include_router(simulation.router, prefix=settings.API_V1_STR)
app.include_router(satellite.router, prefix=settings.API_V1_STR)
app.include_router(models.router, prefix=settings.API_V1_STR)

# Register WebSocket router
app.include_router(websocket.router)
