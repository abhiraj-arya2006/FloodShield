import math
import numpy as np
from typing import Dict, Any, List, Tuple

class StormCell:
    """Represents a moving atmospheric storm cell with spatial falloff."""
    def __init__(self, cell_config: Dict[str, Any]):
        self.id = cell_config["id"]
        self.start_hour = float(cell_config["start_hour"])
        self.peak_hour = float(cell_config["peak_hour"])
        self.end_hour = float(cell_config["end_hour"])
        self.peak_intensity = float(cell_config["peak_intensity_mm_h"])
        self.init_lat = float(cell_config["center_lat"])
        self.init_lon = float(cell_config["center_lon"])
        self.radius_km = float(cell_config["radius_km"])
        self.velocity_km_h = float(cell_config.get("velocity_km_h", 10.0))
        self.bearing_deg = float(cell_config.get("bearing_deg", 45.0))

    def get_position_at(self, hour: float) -> Tuple[float, float]:
        """Calculate center lat/lon at virtual time hour."""
        dt = hour - self.start_hour
        if dt < 0:
            return self.init_lat, self.init_lon
        
        dist_km = self.velocity_km_h * dt
        bearing_rad = math.radians(self.bearing_deg)
        
        # 1 deg lat ~ 111 km, 1 deg lon ~ 111 * cos(lat) km
        delta_lat = (dist_km * math.cos(bearing_rad)) / 111.0
        delta_lon = (dist_km * math.sin(bearing_rad)) / (111.0 * math.cos(math.radians(self.init_lat)))
        
        return self.init_lat + delta_lat, self.init_lon + delta_lon

    def intensity_at(self, lat: float, lon: float, hour: float) -> float:
        """Calculate rainfall intensity contribution at (lat, lon) at time hour."""
        if hour < self.start_hour or hour > self.end_hour:
            return 0.0
            
        # Temporal bell curve
        if hour <= self.peak_hour:
            time_factor = (hour - self.start_hour) / max(0.01, (self.peak_hour - self.start_hour))
        else:
            time_factor = (self.end_hour - hour) / max(0.01, (self.end_hour - self.peak_hour))
        time_factor = math.sin(time_factor * math.pi / 2.0) ** 2
        
        # Spatial distance to center
        c_lat, c_lon = self.get_position_at(hour)
        d_lat_km = (lat - c_lat) * 111.0
        d_lon_km = (lon - c_lon) * 111.0 * math.cos(math.radians(lat))
        dist_km = math.sqrt(d_lat_km * d_lat_km + d_lon_km * d_lon_km)
        
        # Gaussian spatial falloff
        spatial_factor = math.exp(-0.5 * (dist_km / max(1.0, self.radius_km)) ** 2)
        
        return self.peak_intensity * time_factor * spatial_factor

class SpatialRainfallField:
    """Computes spatial and temporal weather fields across Delhi NCR."""
    def __init__(self, scenario_config: Dict[str, Any]):
        self.scenario_id = scenario_config["id"]
        self.base_rainfall = float(scenario_config.get("base_rainfall_mm_h", 0.0))
        self.upstream_river_stage = float(scenario_config.get("upstream_river_stage_m", 203.0))
        self.soil_moisture_initial = float(scenario_config.get("soil_moisture_initial", 0.3))
        self.drain_blockage_baseline = float(scenario_config.get("drain_blockage_baseline", 0.1))
        
        self.storm_cells = [
            StormCell(c) for c in scenario_config.get("storm_cells", [])
        ]

    def get_instantaneous_rain(self, lat: float, lon: float, hour: float, multiplier: float = 1.0) -> float:
        """Instantaneous rainfall intensity in mm/h at given coordinate and hour."""
        cell_contrib = sum(cell.intensity_at(lat, lon, hour) for cell in self.storm_cells)
        return max(0.0, (self.base_rainfall + cell_contrib) * multiplier)

    def get_accumulated_rain(self, lat: float, lon: float, current_hour: float, duration_hours: float, multiplier: float = 1.0) -> float:
        """Approximates accumulated rainfall using trapezoidal integration."""
        if duration_hours <= 0.0:
            return 0.0
        steps = max(4, int(duration_hours * 4)) # 15-minute sampling
        t_samples = np.linspace(max(0.0, current_hour - duration_hours), current_hour, steps)
        dt = duration_hours / max(1, steps - 1)
        
        values = [self.get_instantaneous_rain(lat, lon, t, multiplier) for t in t_samples]
        return float(np.trapezoid(values, dx=dt))

    def get_forecast_rain(self, lat: float, lon: float, current_hour: float, lead_hours: float, multiplier: float = 1.0) -> float:
        """Forecast rainfall accumulated over future window [current_hour, current_hour + lead_hours]."""
        steps = max(4, int(lead_hours * 4))
        t_samples = np.linspace(current_hour, current_hour + lead_hours, steps)
        dt = lead_hours / max(1, steps - 1)
        values = [self.get_instantaneous_rain(lat, lon, t, multiplier) for t in t_samples]
        return float(np.trapezoid(values, dx=dt))

    def get_river_stage(self, hour: float) -> float:
        """Simulate dynamic Yamuna river stage."""
        # Under compound surge, water level increases as upstream surge arrives
        if self.scenario_id == "compound_surge":
            surge = min(2.5, hour * 0.35)
            return self.upstream_river_stage + surge
        elif self.scenario_id == "monsoon_continuous":
            surge = min(1.2, hour * 0.12)
            return self.upstream_river_stage + surge
        return self.upstream_river_stage

    def get_ambient_weather(self, current_rain: float) -> Dict[str, float]:
        """Compute physically consistent atmospheric variables."""
        # Rain depresses temperature and raises humidity
        temp_c = 34.0 - min(8.0, current_rain * 0.15)
        humidity_pct = min(98.0, 65.0 + current_rain * 0.6)
        wind_km_h = 12.0 + min(40.0, current_rain * 0.5)
        pressure_hpa = 1008.0 - min(14.0, current_rain * 0.2)
        
        return {
            "temperature_c": round(temp_c, 1),
            "humidity_pct": round(humidity_pct, 1),
            "wind_speed_km_h": round(wind_km_h, 1),
            "pressure_hpa": round(pressure_hpa, 1)
        }
