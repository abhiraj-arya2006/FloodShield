import abc
from typing import Dict, Any, List
from datetime import datetime, timezone

from backend.app.simulation.engine import simulation_engine

class WeatherProvider(abc.ABC):
    """Abstract Weather Provider interface."""
    @abc.abstractmethod
    def get_current_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        pass

    @abc.abstractmethod
    def get_forecast(self, lat: float, lon: float, hours: int = 6) -> List[Dict[str, Any]]:
        pass

class MockWeatherProvider(WeatherProvider):
    """Simulation-backed Weather Provider for Milestone 1."""
    def __init__(self):
        self.engine = simulation_engine

    def get_current_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        hour = self.engine.clock.get_elapsed_hours()
        rf = self.engine.weather_field.get_instantaneous_rain(lat, lon, hour)
        ambient = self.engine.weather_field.get_ambient_weather(rf)
        return {
            "timestamp": self.engine.clock.get_current_time().isoformat(),
            "latitude": lat,
            "longitude": lon,
            "rainfall_current_mm_h": round(rf, 2),
            "temperature_c": ambient["temperature_c"],
            "humidity_pct": ambient["humidity_pct"],
            "wind_speed_km_h": ambient["wind_speed_km_h"],
            "pressure_hpa": ambient["pressure_hpa"],
            "source": "SimulationEngine (Delhi NCR Atmospheric Model)",
            "is_simulated": True
        }

    def get_forecast(self, lat: float, lon: float, hours: int = 6) -> List[Dict[str, Any]]:
        current_hour = self.engine.clock.get_elapsed_hours()
        forecasts = []
        for lead in range(1, hours + 1):
            rf = self.engine.weather_field.get_forecast_rain(lat, lon, current_hour, float(lead))
            forecasts.append({
                "lead_hour": lead,
                "accumulated_rain_mm": round(rf, 2),
                "is_simulated": True
            })
        return forecasts

weather_provider = MockWeatherProvider()
