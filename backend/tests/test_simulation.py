import pytest
from backend.app.simulation.grid import DelhiGridGenerator
from backend.app.simulation.engine import simulation_engine

def test_grid_generation_determinism():
    """Verify that two generator instances with seed 42 produce identical zones."""
    gen1 = DelhiGridGenerator(cell_size_m=1000, seed=42)
    gen2 = DelhiGridGenerator(cell_size_m=1000, seed=42)
    
    zones1 = gen1.generate_zones()
    zones2 = gen2.generate_zones()
    
    assert len(zones1) == len(zones2)
    assert len(zones1) > 1000
    assert zones1[0].zone_id == zones2[0].zone_id
    assert zones1[0].elevation_m == zones2[0].elevation_m
    assert zones1[0].centroid_lat == zones2[0].centroid_lat
    assert zones1[0].centroid_lon == zones2[0].centroid_lon

def test_single_source_of_truth_consistency():
    """Verify that multiple calls for identical scenario and hour yield identical dataframes."""
    simulation_engine.set_scenario("monsoon_continuous")
    df1 = simulation_engine.get_feature_table(hour=2.5)
    df2 = simulation_engine.get_feature_table(hour=2.5)
    
    assert len(df1) == len(df2)
    assert (df1["hazard_index"] == df2["hazard_index"]).all()
    assert (df1["rainfall_current"] == df2["rainfall_current"]).all()
