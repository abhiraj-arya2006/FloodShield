import logging
import threading

from dotenv import load_dotenv

load_dotenv()  # Reads ANTHROPIC_API_KEY from .env when it exists.

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.backend.live import forecaster as live_forecaster
from app.backend.routes import router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="FloodShield: River Flood Early Warning System",
    version="2.0.0",
    description="Early-warning streamflow forecasting API for Godavari and Mahanadi river basins based on STG-Mamba predictions."
)

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Header middleware
@app.middleware("http")
async def add_custom_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Data-Mode"] = "replay"
    response.headers["X-Basins"] = "Godavari,Mahanadi"
    response.headers["X-Disclaimer"] = "Academic prototype: q95 local threshold, not official CWC flood level"
    return response

# Standardized validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_msg = errors[0].get("msg", "Invalid parameter") if errors else "Validation error"
    loc = " -> ".join(str(l) for l in errors[0].get("loc", [])) if errors else ""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_code": "VALIDATION_ERROR",
            "detail": f"{first_msg} at {loc}".strip(),
            "errors": errors
        }
    )

# Include API routes
app.include_router(router)


@app.on_event("startup")
def warm_live_forecast():
    """Prepares today's forecast in the background, so the first visitor doesn't wait for it."""
    def warm():
        try:
            live_forecaster.current()
        except Exception as error:
            logger.warning("Couldn't prepare the live forecast at startup: %s", error)

    threading.Thread(target=warm, daemon=True).start()

