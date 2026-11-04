"""Tests for Open-Meteo grid-cell sampling (considered, not used; tiny hand-built polygons)."""

import pytest
from shapely.geometry import Point, Polygon, box

from floodshield.data.cell_sampling import (
    cell_id,
    choose_cells,
    farthest_point_sample,
    grid_centres_in_polygon,
    max_points_for_area,
    snap,
)

RULES = {"single_point_area_km2_max": 5000, "medium_area_km2_max": 50000,
         "medium_max_points": 4, "large_max_points": 12}


def test_snap_to_quarter_degree_grid():
    assert snap(23.37, 0.25) == 23.25
    assert snap(23.38, 0.25) == 23.5
    assert snap(82.6, 0.25, origin=0.125) == 82.625


def test_cell_id_is_stable_text():
    assert cell_id(23.5, 82.5) == "23.500_82.500"


def test_grid_centres_inside_box_include_boundary():
    # box from lon 80.0-80.5, lat 20.0-20.25 -> 3 x 2 centres on a 0.25 grid
    cells = grid_centres_in_polygon(box(80.0, 20.0, 80.5, 20.25), 0.25)
    assert sorted(cells) == [(20.0, 80.0), (20.0, 80.25), (20.0, 80.5),
                             (20.25, 80.0), (20.25, 80.25), (20.25, 80.5)]


def test_grid_centres_exclude_points_outside_triangle():
    tri = Polygon([(80.0, 20.0), (81.0, 20.0), (80.0, 21.0)])
    cells = grid_centres_in_polygon(tri, 0.5)
    assert sorted(cells) == [(20.0, 80.0), (20.0, 80.5), (20.0, 81.0),
                             (20.5, 80.0), (20.5, 80.5), (21.0, 80.0)]


@pytest.mark.parametrize("area, expected", [(4999, 1), (5000, 4), (50000, 4), (50001, 12)])
def test_points_per_area_class(area, expected):
    assert max_points_for_area(area, RULES) == expected


def test_farthest_point_sample_spreads_out_and_is_deterministic():
    line = [(20.0, 80.0 + 0.25 * i) for i in range(9)]  # 9 cells in a row
    picked = farthest_point_sample(line, 3, start=(20.0, 80.0))
    assert picked == [(20.0, 80.0), (20.0, 82.0), (20.0, 81.0)]
    assert farthest_point_sample(line, 3, start=(20.0, 80.0)) == picked
    assert farthest_point_sample(line, 20, start=(20.0, 80.0)) == line


def test_small_catchment_uses_one_inside_cell():
    poly = box(80.1, 20.1, 80.6, 20.4)   # inside centres: (20.25, 80.25), (20.25, 80.5)
    choice = choose_cells(poly, 1000, RULES, 0.25)
    assert choice.method == "inside_cell_nearest_representative_point"
    assert len(choice.cells) == 1 and choice.cells[0] in [(20.25, 80.25), (20.25, 80.5)]


def test_small_catchment_without_inside_cell_falls_back_to_snapped_point():
    poly = box(80.05, 20.05, 80.2, 20.2)   # no 0.25 centre inside
    choice = choose_cells(poly, 300, RULES, 0.25)
    assert choice.method == "representative_point_snapped"
    assert choice.n_cells_inside == 0
    assert choice.cells == [(snap(poly.representative_point().y, 0.25),
                             snap(poly.representative_point().x, 0.25))]


def test_large_catchment_capped_and_all_cells_inside():
    poly = box(78.0, 18.0, 81.0, 21.0)   # 13 x 13 centres
    choice = choose_cells(poly, 100000, RULES, 0.25)
    assert choice.method == "farthest_point_sample"
    assert choice.n_cells_inside == 169
    assert len(choice.cells) == 12 and len(set(choice.cells)) == 12
    assert all(poly.covers(Point(lon, lat)) for lat, lon in choice.cells)


def test_medium_catchment_with_few_cells_takes_all():
    poly = box(80.0, 20.0, 80.25, 20.0001)   # 2 centres on the bottom edge
    choice = choose_cells(poly, 6000, RULES, 0.25)
    assert choice.method == "all_cells_inside"
    assert sorted(choice.cells) == [(20.0, 80.0), (20.0, 80.25)]
