from datetime import datetime
import re
from typing import Optional
from fastapi import APIRouter, Query, Path, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse

from app.backend.schemas import (
    HealthResponse, GaugesResponse, EdgesResponse, DatesResponse,
    ForecastResponse, SingleGaugeForecastResponse, AlertsResponse, ModelInfoResponse, AskRequest
)
from app.backend.data_source import DataSource, get_data_source
from app.backend import ask

router = APIRouter(prefix="/api", tags=["FloodShield River Forecasting"])

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_date_param(date_str: str) -> str:
    if not DATE_PATTERN.match(date_str):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format '{date_str}'. Expected format YYYY-MM-DD."
        )
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Date '{date_str}' is not a valid calendar date."
        )
    return date_str


@router.get("/health", response_model=HealthResponse)
def get_health(source: DataSource = Depends(get_data_source)):
    """Health check returning operational status and active replay mode."""
    return source.get_health()


@router.get("/gauges", response_model=GaugesResponse)
def get_gauges(source: DataSource = Depends(get_data_source)):
    """Returns metadata, coordinates, and high-flow thresholds for all 46 river gauges."""
    return source.get_gauges()


@router.get("/edges", response_model=EdgesResponse)
def get_edges(source: DataSource = Depends(get_data_source)):
    """Returns river network topological links (upstream to downstream with distance in km)."""
    return source.get_edges()


@router.get("/dates", response_model=DatesResponse)
def get_dates(source: DataSource = Depends(get_data_source)):
    """Returns the list of available forecast dates in the replay archive (2009-2018)."""
    return source.get_dates()


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    date: str = Query(..., description="Forecast date (YYYY-MM-DD)"),
    lead: int = Query(2, ge=1, le=4, description="Forecast lead day (1=nowcast, 2, 3, 4=headline)"),
    source: DataSource = Depends(get_data_source)
):
    """Returns streamflow forecast for all 46 gauges for the specified date and lead day."""
    valid_date = validate_date_param(date)
    return source.get_forecast(date=valid_date, lead_day=lead)


@router.get("/gauges/{gauge_id}/forecast", response_model=SingleGaugeForecastResponse)
def get_single_gauge_forecast(
    gauge_id: str = Path(..., min_length=1, max_length=10, description="5-character string gauge ID (e.g. '01001')"),
    date: str = Query(..., description="Forecast date (YYYY-MM-DD)"),
    source: DataSource = Depends(get_data_source)
):
    """Returns 4-day lead predictions and observed streamflow (if available) for a specific gauge."""
    valid_date = validate_date_param(date)
    return source.get_gauge_forecast(gauge_id=gauge_id, date=valid_date)


@router.get("/alerts", response_model=AlertsResponse)
def get_alerts(
    date: str = Query(..., description="Forecast date (YYYY-MM-DD)"),
    lead: int = Query(2, ge=1, le=4, description="Forecast lead day (1 to 4)"),
    source: DataSource = Depends(get_data_source)
):
    """Returns the active WATCH and WARNING river flood alerts with simulated drafted CAP/SMS messages."""
    valid_date = validate_date_param(date)
    return source.get_alerts(date=valid_date, lead_day=lead)


@router.get("/model-info", response_model=ModelInfoResponse)
def get_model_info(source: DataSource = Depends(get_data_source)):
    """Returns static model architecture, correction stage, training years, and dataset sources from config."""
    return source.get_model_info()


@router.post("/ask")
def ask_question(body: AskRequest, request: Request, source: DataSource = Depends(get_data_source)):
    """Answers a question from the forecast on screen, with Claude if a key is set, otherwise built-in answers."""
    start = validate_date_param(body.start)
    if not ask.limiter.allow(request.client.host if request.client else "unknown"):
        raise HTTPException(status_code=429, detail="Too many questions. Wait a minute, then ask again.")
    forecast = ask.load_forecast(source, start)
    if ask.claude_available():
        answer, answered_by = ask.stream_claude(body, forecast, source), "claude"
    else:
        answer, answered_by = iter([ask.builtin_answer(body, forecast, source)]), "built-in"
    return StreamingResponse(answer, media_type="text/plain; charset=utf-8", headers={"X-Answered-By": answered_by})
