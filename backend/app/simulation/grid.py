import math
import numpy as np
from pyproj import Transformer
from typing import List, Dict, Tuple, Any
from backend.app.models.schemas import ZoneStatic, ZoneGeometry

# Curated Delhi NCR localities with approximate coordinates (EPSG:4326)
CURATED_LOCALITIES = [
    {"name": "Najafgarh", "locality": "Najafgarh Basin", "lat": 28.6092, "lon": 76.9855, "type_bias": "PLUVIAL"},
    {"name": "Dwarka Sector 21", "locality": "South West Delhi", "lat": 28.5524, "lon": 77.0583, "type_bias": "PLUVIAL"},
    {"name": "Narela Industrial", "locality": "North Delhi", "lat": 28.8529, "lon": 77.0917, "type_bias": "PLUVIAL"},
    {"name": "Rohini Sector 16", "locality": "North West Delhi", "lat": 28.7360, "lon": 77.1130, "type_bias": "PLUVIAL"},
    {"name": "Yamuna Vihar", "locality": "North East Delhi", "lat": 28.6975, "lon": 77.2764, "type_bias": "FLUVIAL"},
    {"name": "ITO Ring Road", "locality": "Central Delhi", "lat": 28.6294, "lon": 77.2464, "type_bias": "FLUVIAL"},
    {"name": "Connaught Place", "locality": "New Delhi", "lat": 28.6315, "lon": 77.2167, "type_bias": "PLUVIAL"},
    {"name": "Okhla Phase III", "locality": "South East Delhi", "lat": 28.5355, "lon": 77.2732, "type_bias": "PLUVIAL"},
    {"name": "Mehrauli", "locality": "South Delhi", "lat": 28.5177, "lon": 77.1852, "type_bias": "PLUVIAL"},
    {"name": "Vasant Kunj", "locality": "South West Delhi", "lat": 28.5298, "lon": 77.1539, "type_bias": "PLUVIAL"},
    {"name": "Cyber City Gurugram", "locality": "Gurugram East", "lat": 28.4950, "lon": 77.0890, "type_bias": "PLUVIAL"},
    {"name": "Golf Course Road", "locality": "Gurugram Sector 42/54", "lat": 28.4520, "lon": 77.1050, "type_bias": "PLUVIAL"},
    {"name": "Badshahpur Drain Corridor", "locality": "Gurugram Sector 66", "lat": 28.4010, "lon": 77.0620, "type_bias": "COMPOUND"},
    {"name": "Sohna Road Sub-basin", "locality": "Gurugram South", "lat": 28.4120, "lon": 77.0380, "type_bias": "PLUVIAL"},
    {"name": "Mayur Vihar Phase 1", "locality": "East Delhi", "lat": 28.6080, "lon": 77.2960, "type_bias": "FLUVIAL"},
    {"name": "Anand Vihar ISBT", "locality": "East Delhi", "lat": 28.6470, "lon": 77.3150, "type_bias": "PLUVIAL"},
    {"name": "Chandni Chowk", "locality": "Old Delhi", "lat": 28.6560, "lon": 77.2300, "type_bias": "PLUVIAL"},
    {"name": "Karol Bagh", "locality": "Central Delhi", "lat": 28.6520, "lon": 77.1900, "type_bias": "PLUVIAL"},
    {"name": "Sarita Vihar", "locality": "South East Delhi", "lat": 28.5280, "lon": 77.2980, "type_bias": "FLUVIAL"},
    {"name": "Model Town", "locality": "North Delhi", "lat": 28.7020, "lon": 77.1930, "type_bias": "PLUVIAL"},
    {"name": "Moti Nagar", "locality": "West Delhi", "lat": 28.6570, "lon": 77.1420, "type_bias": "PLUVIAL"},
    {"name": "Aerocity / IGI Airport", "locality": "South West Delhi", "lat": 28.5550, "lon": 77.1200, "type_bias": "PLUVIAL"}
]

# Approximate river channel coordinates (Yamuna flowing through Delhi)
YAMUNA_POINTS = [
    (28.88, 77.18), (28.80, 77.21), (28.72, 77.23), (28.65, 77.25),
    (28.62, 77.26), (28.55, 77.30), (28.45, 77.34), (28.38, 77.36)
]

# Approximate Najafgarh Drain trajectory
NAJAFGARH_DRAIN_POINTS = [
    (28.42, 76.96), (28.52, 76.99), (28.60, 77.04), (28.66, 77.11), (28.70, 77.21)
]

class DelhiGridGenerator:
    """
    Generates a deterministic spatial grid for Delhi NCR in EPSG:32643 (UTM 43N)
    and transforms coordinates to EPSG:4326 (WGS84).
    """
    def __init__(self, cell_size_m: int = 500, seed: int = 42):
        self.cell_size_m = cell_size_m
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        
        # Coordinate Transformers
        self.to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
        self.to_wgs84 = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
        
        # Approximate NCR envelope in WGS84
        # lat: 28.38 to 28.86 (~53 km), lon: 76.88 to 77.35 (~46 km)
        self.min_lon, self.min_lat = 76.88, 28.38
        self.max_lon, self.max_lat = 77.35, 28.86
        
        # Transform envelope to UTM 43N (meters)
        self.utm_min_x, self.utm_min_y = self.to_utm.transform(self.min_lon, self.min_lat)
        self.utm_max_x, self.utm_max_y = self.to_utm.transform(self.max_lon, self.max_lat)

    def _is_inside_ncr_hull(self, lat: float, lon: float) -> bool:
        """
        Simplified geometric filter clipping to approximate Delhi NCR territory.
        Ensures polygon stays realistic around Delhi and Gurugram urban extent.
        """
        # Exclude extreme corners outside urban NCR footprint
        if lat < 28.40 and lon > 77.25: # Southeast rural
            return False
        if lat > 28.82 and lon < 77.00: # Northwest rural Haryana
            return False
        if lat < 28.42 and lon < 76.92: # Far southwest
            return False
        return True

    def _dist_to_line_string(self, lat: float, lon: float, line_points: List[Tuple[float, float]]) -> float:
        """Calculate approximate distance in meters to a polyline in lat/lon."""
        min_dist = float("inf")
        for plat, plon in line_points:
            d_lat = (lat - plat) * 111000.0
            d_lon = (lon - plon) * 111000.0 * math.cos(math.radians(lat))
            dist = math.sqrt(d_lat * d_lat + d_lon * d_lon)
            if dist < min_dist:
                min_dist = dist
        return min_dist

    def generate_zones(self) -> List[ZoneStatic]:
        """Generate deterministic static zones."""
        zones = []
        
        # Create UTM grid steps
        x_steps = np.arange(self.utm_min_x, self.utm_max_x, self.cell_size_m)
        y_steps = np.arange(self.utm_min_y, self.utm_max_y, self.cell_size_m)
        
        cell_index = 0
        
        # Locality coords for fast nearest-neighbor matching
        loc_coords = np.array([[l["lat"], l["lon"]] for l in CURATED_LOCALITIES])
        
        for x in x_steps:
            for y in y_steps:
                # Bounding box of the cell in UTM
                x0, y0 = x, y
                x1, y1 = x + self.cell_size_m, y + self.cell_size_m
                
                # Centroid in UTM & WGS84
                cx, cy = x + self.cell_size_m / 2.0, y + self.cell_size_m / 2.0
                clon, clat = self.to_wgs84.transform(cx, cy)
                
                if not self._is_inside_ncr_hull(clat, clon):
                    continue
                
                # Transform 4 corners to WGS84 for GeoJSON Polygon
                p1_lon, p1_lat = self.to_wgs84.transform(x0, y0)
                p2_lon, p2_lat = self.to_wgs84.transform(x1, y0)
                p3_lon, p3_lat = self.to_wgs84.transform(x1, y1)
                p4_lon, p4_lat = self.to_wgs84.transform(x0, y1)
                
                # Find nearest locality
                dists = (loc_coords[:, 0] - clat)**2 + ((loc_coords[:, 1] - clon) * math.cos(math.radians(clat)))**2
                nearest_idx = int(np.argmin(dists))
                loc_info = CURATED_LOCALITIES[nearest_idx]
                
                # --- Plausible Terrain Simulation (Section 5) ---
                # Aravalli Ridge (south/southwest): higher ground ~260-310m
                # Yamuna flood plain (east): low-lying ~202-208m
                # Najafgarh low depression: ~206-212m
                dist_ridge = math.sqrt((clat - 28.45)**2 + (clon - 77.10)**2) * 111.0 # km from Aravalli ridge
                ridge_elevation = max(0.0, 310.0 - dist_ridge * 3.5)
                
                dist_river_m = self._dist_to_line_string(clat, clon, YAMUNA_POINTS)
                dist_drain_m = self._dist_to_line_string(clat, clon, NAJAFGARH_DRAIN_POINTS)
                
                # Base elevation model
                base_elev = 205.0 + (clat - 28.38) * 15.0 + (77.35 - clon) * 12.0
                if dist_river_m < 3000.0:
                    base_elev = 203.0 + (dist_river_m / 3000.0) * 5.0
                elevation = max(202.0, min(320.0, base_elev + ridge_elevation * 0.4 + self.rng.uniform(-1.5, 1.5)))
                
                # Slope in degrees (higher near ridge, flatter near river)
                slope = 0.5 + (ridge_elevation / 100.0) * 3.0 + self.rng.uniform(0.1, 0.8)
                
                # Height Above Nearest Drainage (HAND)
                min_drain_dist = min(dist_river_m, dist_drain_m)
                hand = max(0.5, (min_drain_dist / 1000.0) * 1.8 + slope * 0.4 + self.rng.uniform(-0.5, 0.5))
                
                # Topographic Wetness Index: ln(a / tan(b))
                flow_accum = max(10.0, 50000.0 / (min_drain_dist + 200.0) + self.rng.uniform(5.0, 50.0))
                twi = float(np.log(flow_accum / (np.tan(np.radians(max(0.2, slope))) + 0.01)))
                twi = max(3.0, min(18.0, twi))
                
                # Urbanization attributes
                # High density in central/east Delhi, tech corridors in Gurugram
                is_core_urban = (clat > 28.52 and clat < 28.72 and clon > 77.10 and clon < 77.28)
                impervious = 0.75 + self.rng.uniform(-0.15, 0.15) if is_core_urban else 0.45 + self.rng.uniform(-0.2, 0.25)
                impervious = float(np.clip(impervious, 0.1, 0.95))
                
                building_density = float(np.clip(impervious * 0.85 + self.rng.uniform(-0.1, 0.1), 0.05, 0.92))
                road_density = float(np.clip(impervious * 0.70 + self.rng.uniform(-0.1, 0.1), 0.05, 0.88))
                veg_ratio = float(np.clip(1.0 - impervious - building_density * 0.2, 0.05, 0.85))
                drain_density = float(np.clip(1.2 + (impervious * 2.2) - (hand * 0.15), 0.4, 4.5))
                
                # Exposure attributes (Section 16)
                pop_density_km2 = 18000 if is_core_urban else 6000
                cell_area_km2 = (self.cell_size_m / 1000.0)**2
                cell_pop = int(pop_density_km2 * cell_area_km2 * (0.6 + self.rng.uniform(0.0, 0.8)))
                
                crit_facilities = int(self.rng.choice([0, 1, 2, 3], p=[0.70, 0.18, 0.09, 0.03]))
                road_importance = float(np.clip(road_density * 0.8 + (1.0 if "Ring Road" in loc_info["name"] or "Golf Course" in loc_info["name"] else 0.2), 0.1, 1.0))
                
                zone_id = f"DEL_{cell_index:04d}"
                zone_name = f"{loc_info['name']} ({zone_id})"
                
                polygon_coords = [[
                    [round(p1_lon, 6), round(p1_lat, 6)],
                    [round(p2_lon, 6), round(p2_lat, 6)],
                    [round(p3_lon, 6), round(p3_lat, 6)],
                    [round(p4_lon, 6), round(p4_lat, 6)],
                    [round(p1_lon, 6), round(p1_lat, 6)]
                ]]
                
                zones.append(ZoneStatic(
                    zone_id=zone_id,
                    name=zone_name,
                    locality=loc_info["locality"],
                    centroid_lat=round(clat, 6),
                    centroid_lon=round(clon, 6),
                    geometry=ZoneGeometry(coordinates=polygon_coords),
                    elevation_m=round(elevation, 1),
                    slope_deg=round(slope, 2),
                    flow_accumulation=round(flow_accum, 1),
                    dist_to_river_m=round(dist_river_m, 1),
                    dist_to_drain_m=round(dist_drain_m, 1),
                    twi=round(twi, 2),
                    hand_m=round(hand, 2),
                    impervious_ratio=round(impervious, 3),
                    building_density=round(building_density, 3),
                    road_density=round(road_density, 3),
                    vegetation_ratio=round(veg_ratio, 3),
                    drainage_density_km_km2=round(drain_density, 2),
                    population=cell_pop,
                    critical_facilities_count=crit_facilities,
                    road_importance_score=round(road_importance, 2),
                    is_simulated=True
                ))
                
                cell_index += 1
                
        return zones
