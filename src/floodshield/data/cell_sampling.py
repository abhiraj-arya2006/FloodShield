"""Choose weather grid cells for each catchment (Open-Meteo point sampling).

Considered, NOT used: Open-Meteo was dropped; kept for reference with its tests.

Cells are centres of a regular lat/lon grid aligned to the reanalysis grid
(``origin + k * resolution``). Each catchment gets a number of points that
depends on its area:

- small catchments: one point, the grid centre inside the polygon nearest to
  the polygon's representative point (or the representative point snapped to
  the grid if no centre lies inside);
- larger catchments: grid centres inside the polygon, thinned to an evenly
  spread subset by farthest-point sampling when more fit than allowed.

Cells are identified by their centre coordinates so nested catchments that
pick the same cell share one download.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry
from shapely.prepared import prep

COORD_DECIMALS = 6


@dataclass(frozen=True)
class CellChoice:
    cells: list[tuple[float, float]]   # (lat, lon) grid centres
    method: str                        # how the cells were chosen
    n_cells_inside: int                # grid centres inside the polygon


def snap(value: float, resolution: float, origin: float = 0.0) -> float:
    """Nearest grid-centre coordinate."""
    return round(round((value - origin) / resolution) * resolution + origin, COORD_DECIMALS)


def cell_id(lat: float, lon: float) -> str:
    return f"{lat:.3f}_{lon:.3f}"


def grid_centres_in_polygon(poly: BaseGeometry, resolution: float,
                            origin: float = 0.0) -> list[tuple[float, float]]:
    """All grid centres (lat, lon) that lie inside or on the polygon boundary."""
    minx, miny, maxx, maxy = poly.bounds
    k_lon = range(math.ceil((minx - origin) / resolution), math.floor((maxx - origin) / resolution) + 1)
    k_lat = range(math.ceil((miny - origin) / resolution), math.floor((maxy - origin) / resolution) + 1)
    covers = prep(poly).covers
    cells = []
    for i in k_lat:
        lat = round(origin + i * resolution, COORD_DECIMALS)
        for j in k_lon:
            lon = round(origin + j * resolution, COORD_DECIMALS)
            if covers(Point(lon, lat)):
                cells.append((lat, lon))
    return cells


def farthest_point_sample(points: Sequence[tuple[float, float]], k: int,
                          start: tuple[float, float]) -> list[tuple[float, float]]:
    """Pick ``k`` evenly spread points, deterministically.

    Starts from the point nearest ``start`` and repeatedly adds the point whose
    distance to the already chosen set is largest (first one wins ties).
    Distances use longitude scaled by cos(latitude).
    """
    if k >= len(points):
        return list(points)
    pts = np.asarray(points, dtype="float64")
    scale = np.array([1.0, math.cos(math.radians(pts[:, 0].mean()))])
    xy = pts * scale
    first = int(np.argmin(((xy - np.asarray(start) * scale) ** 2).sum(axis=1)))
    chosen = [first]
    dist = ((xy - xy[first]) ** 2).sum(axis=1)
    while len(chosen) < k:
        nxt = int(np.argmax(dist))
        chosen.append(nxt)
        dist = np.minimum(dist, ((xy - xy[nxt]) ** 2).sum(axis=1))
    return [tuple(points[i]) for i in chosen]


def max_points_for_area(area_km2: float, rules: Mapping) -> int:
    """Number of points allowed for a catchment area, from the config rules."""
    if area_km2 < rules["single_point_area_km2_max"]:
        return 1
    if area_km2 <= rules["medium_area_km2_max"]:
        return int(rules["medium_max_points"])
    return int(rules["large_max_points"])


def choose_cells(poly: BaseGeometry, area_km2: float, rules: Mapping,
                 resolution: float, origin: float = 0.0) -> CellChoice:
    rep = poly.representative_point()
    rep_cell = (snap(rep.y, resolution, origin), snap(rep.x, resolution, origin))
    inside = grid_centres_in_polygon(poly, resolution, origin)
    n_max = max_points_for_area(area_km2, rules)

    if n_max == 1:
        if not inside:
            return CellChoice([rep_cell], "representative_point_snapped", 0)
        # Snapping can push the representative point outside the polygon; use
        # the inside grid centre nearest to it instead.
        nearest = farthest_point_sample(inside, 1, (rep.y, rep.x))
        return CellChoice(nearest, "inside_cell_nearest_representative_point", len(inside))
    if not inside:
        return CellChoice([rep_cell], "representative_point_fallback_no_cell_inside", 0)
    if len(inside) <= n_max:
        return CellChoice(inside, "all_cells_inside", len(inside))
    picked = farthest_point_sample(inside, n_max, (rep.y, rep.x))
    return CellChoice(picked, "farthest_point_sample", len(inside))
