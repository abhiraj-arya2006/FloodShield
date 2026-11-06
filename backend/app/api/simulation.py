from fastapi import APIRouter, HTTPException, Body
from backend.app.simulation.engine import simulation_engine
from backend.app.models.schemas import SimulationState, SimulationControlRequest

router = APIRouter(prefix="/simulation", tags=["Simulation Control"])

@router.get("/state", response_model=SimulationState)
def get_simulation_state():
    """Current clock time, play/pause state, speed multiplier, and active scenario."""
    return simulation_engine.get_state()

@router.post("/control", response_model=SimulationState)
def control_simulation(req: SimulationControlRequest = Body(...)):
    """
    Control simulation clock: play, pause, set_speed (1, 10, 60),
    seek to second offset, or switch active scenario.
    """
    if req.action == "play":
        simulation_engine.clock.play()
    elif req.action == "pause":
        simulation_engine.clock.pause()
    elif req.action == "set_speed":
        if req.speed in [1, 10, 60]:
            simulation_engine.clock.set_speed(req.speed)
        else:
            raise HTTPException(status_code=400, detail="Supported speeds are 1, 10, 60.")
    elif req.action == "seek":
        if req.seek_seconds is not None:
            simulation_engine.clock.seek_seconds(req.seek_seconds)
    elif req.action == "set_scenario":
        if req.scenario_id:
            simulation_engine.set_scenario(req.scenario_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action '{req.action}'.")
        
    return simulation_engine.get_state()
