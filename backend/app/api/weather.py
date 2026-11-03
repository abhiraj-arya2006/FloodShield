from fastapi import APIRouter, Query
from datetime import datetime, timezone

from backend.app.services.weather_provider import weather_provider

router = APIRouter(prefix="/weather", tags=["Weather"])

@router.get("/current")
def get_current_weather(
    lat: float = Query(28.6139, description="Target latitude (default Delhi center)"),
    lon: float = Query(77.2090, description="Target longitude (default Delhi center)")
):
    """Current ambient and rainfall observations at target coordinates."""
    return weather_provider.get_current_weather(lat, lon)

@router.get("/forecast")
def get_weather_forecast(
    lat: float = Query(28.6139, description="Target latitude"),
    lon: float = Query(77.2090, description="Target longitude"),
    hours: int = Query(6, ge=1, le=24, description="Forecast lead hours")
):
    """Precipitation forecast curve over future lead hours."""
    timeline = weather_provider.get_forecast(lat, lon, hours)
    return {
        "latitude": lat,
        "longitude": lon,
        "forecast_hours": hours,
        "timeline": timeline,
        "source": "SimulationEngine (Spatial Atmospheric Model)",
        "is_simulated": True,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
