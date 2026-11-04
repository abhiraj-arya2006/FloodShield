from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class GaugeItem(BaseModel):
    gauge_id: str = Field(..., description="5-character string gauge ID")
    name: str
    river: str
    basin: str
    ghi_lat: float
    ghi_lon: float
    q90_m3s: float
    q95_m3s: float
    watch_m3s: float
    warning_m3s: float


class GaugesResponse(BaseModel):
    total_gauges: int
    gauges: List[GaugeItem]


class EdgeItem(BaseModel):
    from_gauge_id: str = Field(..., description="Upstream gauge 5-char ID")
    to_gauge_id: str = Field(..., description="Downstream gauge 5-char ID")
    river_distance_km: float


class EdgesResponse(BaseModel):
    total_edges: int
    edges: List[EdgeItem]


class DatesResponse(BaseModel):
    dates: List[str]
    data_period: str
    min_date: str
    max_date: str
    total_dates: int


class GaugeForecastRow(BaseModel):
    gauge_id: str = Field(..., description="5-character string gauge ID")
    name: str
    river: str
    basin: str
    ghi_lat: float
    ghi_lon: float
    lead_day: int
    headline_type: Literal["nowcast", "headline"]
    predicted_m3s: float
    q90_m3s: float
    q95_m3s: float
    watch_m3s: float
    warning_m3s: float
    status: Literal["OK", "WATCH", "WARNING"]
    observed_m3s: Optional[float] = None
    mask: bool


class ForecastResponse(BaseModel):
    date: str
    lead_day: int
    mode: str = "replay"
    headline_type: Literal["nowcast", "headline"]
    total_gauges: int
    warning_count: int
    watch_count: int
    ok_count: int
    gauges: List[GaugeForecastRow]


class SingleGaugeLeadDay(BaseModel):
    lead_day: int
    headline_type: Literal["nowcast", "headline"]
    predicted_m3s: float
    status: Literal["OK", "WATCH", "WARNING"]


class SingleGaugeForecastResponse(BaseModel):
    gauge_id: str = Field(..., description="5-character string gauge ID")
    name: str
    river: str
    basin: str
    ghi_lat: float
    ghi_lon: float
    date: str
    q90_m3s: float
    q95_m3s: float
    lead_days: List[SingleGaugeLeadDay]
    observed_m3s: Optional[float] = None
    mask: bool
    mode: str = "replay"


class AlertItem(BaseModel):
    gauge_id: str = Field(..., description="5-character string gauge ID")
    name: str
    river: str
    basin: str
    ghi_lat: float
    ghi_lon: float
    lead_day: int
    status: Literal["WATCH", "WARNING"]
    predicted_m3s: float
    threshold_m3s: float
    q90_m3s: float
    q95_m3s: float
    exceedance_pct: float
    observed_m3s: Optional[float] = None
    flood_day: Optional[bool] = None
    drafted_message: str


class AlertsResponse(BaseModel):
    date: str
    lead_day: int
    mode: str = "replay"
    total_alerts: int
    warning_count: int
    watch_count: int
    alerts: List[AlertItem]


class DataSourceInfo(BaseModel):
    name: str
    role: str
    citation: str


class ModelInfoResponse(BaseModel):
    model_name: str
    version: str
    description: str
    forecaster: str
    correction_stage: str
    training_years: str
    validation_years: str
    time_step: str
    forecast_horizons: str
    data_sources: List[DataSourceInfo]
    disclaimer: str


class HealthResponse(BaseModel):
    status: str
    mode: str
    data_period: str
    predictions: str
    alert_margin: float
    total_gauges: int
    timestamp: str


class ErrorResponse(BaseModel):
    detail: str
    error_code: str


class AskTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=3000)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)
    start: str = Field(..., description="Date the forecast was made (YYYY-MM-DD)")
    day: int = Field(4, ge=1, le=4)
    gauge_id: Optional[str] = Field(None, max_length=10)
    lang: Literal["en", "hi"] = "en"
    history: List[AskTurn] = Field(default_factory=list, max_length=8)
