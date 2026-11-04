import os
import yaml
import math
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from backend.app.core.config import settings
from backend.app.simulation.grid import DelhiGridGenerator
from backend.app.simulation.clock import SimulationClock
from backend.app.simulation.weather_field import SpatialRainfallField
from backend.app.models.schemas import (
    ZoneStatic, FloodType, RiskLevel, CompactZoneDynamic, SimulationState
)

class SimulationEngine:
    """
    Central deterministic simulation engine and Single Source of Truth.
    Feeds grid state, predictions, risk assessments, explanations, and alerts.
    Vectorized for sub-second execution across 9,500+ cells.
    """
    def __init__(self):
        self._load_scenarios()
        self.clock = SimulationClock(speed=10)
        
        # Deterministic static grid
        self.grid_gen = DelhiGridGenerator(cell_size_m=settings.CELL_SIZE_M, seed=settings.RANDOM_SEED)
        self.zones: List[ZoneStatic] = self.grid_gen.generate_zones()
        self.zone_map: Dict[str, ZoneStatic] = {z.zone_id: z for z in self.zones}
        
        # Pre-build static numpy vectors for ultra-fast vectorized simulation
        self._zone_ids = [z.zone_id for z in self.zones]
        self._names = [z.name for z in self.zones]
        self._localities = [z.locality for z in self.zones]
        self._lats = np.array([z.centroid_lat for z in self.zones], dtype=np.float32)
        self._lons = np.array([z.centroid_lon for z in self.zones], dtype=np.float32)
        self._elevs = np.array([z.elevation_m for z in self.zones], dtype=np.float32)
        self._slopes = np.array([z.slope_deg for z in self.zones], dtype=np.float32)
        self._flow_accums = np.array([z.flow_accumulation for z in self.zones], dtype=np.float32)
        self._dist_rivers = np.array([z.dist_to_river_m for z in self.zones], dtype=np.float32)
        self._dist_drains = np.array([z.dist_to_drain_m for z in self.zones], dtype=np.float32)
        self._twis = np.array([z.twi for z in self.zones], dtype=np.float32)
        self._hands = np.array([z.hand_m for z in self.zones], dtype=np.float32)
        self._impervious = np.array([z.impervious_ratio for z in self.zones], dtype=np.float32)
        self._buildings = np.array([z.building_density for z in self.zones], dtype=np.float32)
        self._roads = np.array([z.road_density for z in self.zones], dtype=np.float32)
        self._veg = np.array([z.vegetation_ratio for z in self.zones], dtype=np.float32)
        self._drain_densities = np.array([z.drainage_density_km_km2 for z in self.zones], dtype=np.float32)
        self._populations = np.array([z.population for z in self.zones], dtype=np.int32)
        self._facilities = np.array([z.critical_facilities_count for z in self.zones], dtype=np.int32)
        self._road_importance = np.array([z.road_importance_score for z in self.zones], dtype=np.float32)
        
        # Active scenario
        self.active_scenario_id = "monsoon_continuous" # Default scenario
        self.weather_field = SpatialRainfallField(self.scenarios[self.active_scenario_id])
        
        # State caches for instant responses
        self._feature_cache: Dict[str, pd.DataFrame] = {}
        self._dynamic_cache: Dict[str, Dict[str, CompactZoneDynamic]] = {}

    def _load_scenarios(self):
        scenario_file = settings.CONFIG_DIR / "scenarios.yaml"
        if os.path.exists(scenario_file):
            with open(scenario_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                self.scenarios = data.get("scenarios", {})
        else:
            self.scenarios = {}

    def set_scenario(self, scenario_id: str):
        """Switch active simulation scenario and reset clock."""
        if scenario_id in self.scenarios:
            self.active_scenario_id = scenario_id
            self.weather_field = SpatialRainfallField(self.scenarios[scenario_id])
            self.clock.seek_seconds(0.0)
            self._feature_cache.clear()
            self._dynamic_cache.clear()

    def get_state(self) -> SimulationState:
        """Return current simulation clock and scenario state."""
        curr_time = self.clock.get_current_time()
        sc_cfg = self.scenarios.get(self.active_scenario_id, {})
        return SimulationState(
            is_running=self.clock.is_running,
            current_time=curr_time.isoformat(),
            scenario_id=self.active_scenario_id,
            scenario_name=sc_cfg.get("name", self.active_scenario_id),
            speed=self.clock.speed,
            elapsed_seconds=round(self.clock.elapsed_sim_seconds, 1),
            total_duration_hours=float(sc_cfg.get("duration_hours", 24.0)),
            is_simulated=True
        )

    def _calc_cell_rain_vectorized(self, hour: float, multiplier: float) -> np.ndarray:
        """Vectorized computation of instantaneous rainfall across all cells."""
        total_rain = np.full_like(self._lats, self.weather_field.base_rainfall, dtype=np.float32)
        for cell in self.weather_field.storm_cells:
            if hour < cell.start_hour or hour > cell.end_hour:
                continue
            if hour <= cell.peak_hour:
                tf = (hour - cell.start_hour) / max(0.01, (cell.peak_hour - cell.start_hour))
            else:
                tf = (cell.end_hour - hour) / max(0.01, (cell.end_hour - cell.peak_hour))
            time_factor = (math.sin(tf * math.pi / 2.0)) ** 2
            
            c_lat, c_lon = cell.get_position_at(hour)
            d_lat_km = (self._lats - c_lat) * 111.0
            d_lon_km = (self._lons - c_lon) * 111.0 * np.cos(np.radians(self._lats))
            dist_sq = d_lat_km ** 2 + d_lon_km ** 2
            spatial_factor = np.exp(-0.5 * dist_sq / (max(1.0, cell.radius_km) ** 2))
            
            total_rain += (cell.peak_intensity * time_factor * spatial_factor).astype(np.float32)
            
        return np.maximum(0.0, total_rain * multiplier)

    def _calc_accum_rain_vectorized(self, current_hour: float, duration_hours: float, multiplier: float) -> np.ndarray:
        """Vectorized trapezoidal integration for rainfall accumulation."""
        if duration_hours <= 0.0:
            return np.zeros_like(self._lats, dtype=np.float32)
        steps = max(4, int(duration_hours * 3))
        t_samples = np.linspace(max(0.0, current_hour - duration_hours), current_hour, steps)
        dt = duration_hours / max(1, steps - 1)
        
        sample_vals = [self._calc_cell_rain_vectorized(t, multiplier) for t in t_samples]
        return np.trapezoid(sample_vals, dx=dt, axis=0)

    def _calc_forecast_rain_vectorized(self, current_hour: float, lead_hours: float, multiplier: float) -> np.ndarray:
        """Vectorized trapezoidal integration for forecast rainfall."""
        steps = max(4, int(lead_hours * 3))
        t_samples = np.linspace(current_hour, current_hour + lead_hours, steps)
        dt = lead_hours / max(1, steps - 1)
        sample_vals = [self._calc_cell_rain_vectorized(t, multiplier) for t in t_samples]
        return np.trapezoid(sample_vals, dx=dt, axis=0)

    def get_feature_table(
        self,
        hour: Optional[float] = None,
        rainfall_multiplier: float = 1.0,
        drain_blockage_pct: float = 0.0
    ) -> pd.DataFrame:
        """
        Single source of truth feature table for the specified simulation hour.
        Vectorized execution ensures sub-100ms response time.
        """
        if hour is None:
            self.clock.update()
            hour = self.clock.get_elapsed_hours()
            
        cache_key = f"{self.active_scenario_id}_{hour:.2f}_{rainfall_multiplier:.2f}_{drain_blockage_pct:.1f}"
        if cache_key in self._feature_cache:
            return self._feature_cache[cache_key]
            
        river_stage = self.weather_field.get_river_stage(hour)
        drain_blockage_factor = min(1.0, (self.weather_field.drain_blockage_baseline + drain_blockage_pct / 100.0))
        
        # 1. Weather Dynamics (Vectorized)
        rf_curr = self._calc_cell_rain_vectorized(hour, rainfall_multiplier)
        rf_1h = self._calc_accum_rain_vectorized(hour, 1.0, rainfall_multiplier)
        rf_3h = self._calc_accum_rain_vectorized(hour, 3.0, rainfall_multiplier)
        rf_6h = self._calc_accum_rain_vectorized(hour, 6.0, rainfall_multiplier)
        rf_24h = self._calc_accum_rain_vectorized(hour, 24.0, rainfall_multiplier)
        
        fc_1h = self._calc_forecast_rain_vectorized(hour, 1.0, rainfall_multiplier)
        fc_3h = self._calc_forecast_rain_vectorized(hour, 3.0, rainfall_multiplier)
        fc_6h = self._calc_forecast_rain_vectorized(hour, 6.0, rainfall_multiplier)
        
        # Ambient temperature & humidity
        temp_c = 34.0 - np.minimum(8.0, rf_curr * 0.15)
        humidity_pct = np.minimum(98.0, 65.0 + rf_curr * 0.6)
        wind_km_h = 12.0 + np.minimum(40.0, rf_curr * 0.5)
        pressure_hpa = 1008.0 - np.minimum(14.0, rf_curr * 0.2)
        
        api_val = rf_24h * 0.5 + rf_6h * 0.3 + rf_1h * 0.2
        soil_m = np.minimum(0.95, self.weather_field.soil_moisture_initial + (rf_6h / 120.0) * 0.45)
        
        # 2. Hydrology & Infiltration (Vectorized)
        infiltration_cap = (1.0 - self._impervious) * 28.0 * (1.0 - soil_m * 0.5)
        effective_drain_cap = self._drain_densities * 14.0 * (1.0 - drain_blockage_factor)
        surface_runoff = np.maximum(0.0, rf_curr - infiltration_cap)
        total_drain_cap = infiltration_cap + effective_drain_cap
        pluvial_stress = (rf_1h * 0.5 + surface_runoff * 0.5) / np.maximum(5.0, total_drain_cap)
        
        # 3. Fluvial Overflow
        river_elev_diff = max(0.0, river_stage - 204.0)
        is_near_river = (self._dist_rivers < 2800.0) & (self._hands < 3.5)
        fluvial_stress = np.where(
            is_near_river,
            (river_elev_diff / 2.0) * (1.0 - np.minimum(1.0, self._dist_rivers / 2800.0)),
            0.0
        )
        
        # 4. Flood Type Determination
        is_compound = (fluvial_stress > 0.4) & (pluvial_stress > 0.4)
        is_fluvial = (fluvial_stress > pluvial_stress) & is_near_river & (fluvial_stress > 0.3)
        flood_types = np.where(is_compound, FloodType.COMPOUND.value,
                              np.where(is_fluvial, FloodType.FLUVIAL.value, FloodType.PLUVIAL.value))
        
        # 5. Combined Hazard Index
        hand_penalty = np.maximum(0.0, 1.0 - self._hands / 4.0)
        elev_penalty = np.where(self._elevs < 215.0, np.maximum(0.0, (215.0 - self._elevs) / 15.0), 0.0)
        
        combined_hazard = (
            pluvial_stress * 0.45 +
            fluvial_stress * 0.35 +
            hand_penalty * 0.10 +
            elev_penalty * 0.05 +
            (self._impervious * 0.05)
        )
        
        df = pd.DataFrame({
            "zone_id": self._zone_ids,
            "name": self._names,
            "locality": self._localities,
            "latitude": np.round(self._lats, 6),
            "longitude": np.round(self._lons, 6),
            "elevation": np.round(self._elevs, 1),
            "slope": np.round(self._slopes, 2),
            "flow_accumulation": np.round(self._flow_accums, 1),
            "dist_to_river": np.round(self._dist_rivers, 1),
            "dist_to_drain": np.round(self._dist_drains, 1),
            "twi": np.round(self._twis, 2),
            "hand": np.round(self._hands, 2),
            "impervious_ratio": np.round(self._impervious, 3),
            "building_density": np.round(self._buildings, 3),
            "road_density": np.round(self._roads, 3),
            "vegetation_ratio": np.round(self._veg, 3),
            "drainage_density": np.round(self._drain_densities, 2),
            "drain_blockage_factor": np.round(drain_blockage_factor, 2),
            "drain_capacity_index": np.round(effective_drain_cap, 2),
            "population": self._populations,
            "critical_facilities_count": self._facilities,
            "road_importance_score": np.round(self._road_importance, 2),
            # Weather & Rainfall
            "rainfall_current": np.round(rf_curr, 2),
            "rainfall_1h": np.round(rf_1h, 2),
            "rainfall_3h": np.round(rf_3h, 2),
            "rainfall_6h": np.round(rf_6h, 2),
            "rainfall_24h": np.round(rf_24h, 2),
            "forecast_1h": np.round(fc_1h, 2),
            "forecast_3h": np.round(fc_3h, 2),
            "forecast_6h": np.round(fc_6h, 2),
            "antecedent_precip_index": np.round(api_val, 2),
            "soil_moisture": np.round(soil_m, 2),
            "temperature": np.round(temp_c, 1),
            "humidity": np.round(humidity_pct, 1),
            "wind_speed": np.round(wind_km_h, 1),
            "pressure": np.round(pressure_hpa, 1),
            "upstream_river_stage": round(river_stage, 2),
            # Targets & Physics
            "hazard_index": np.round(combined_hazard, 4),
            "flood_type": flood_types,
            "target_flood": (combined_hazard > 0.48).astype(int),
            "target_flood_severity": np.round(np.clip(combined_hazard, 0.0, 1.0), 4)
        })
        
        self._feature_cache[cache_key] = df
        return df

# Singleton SimulationEngine instance
simulation_engine = SimulationEngine()
