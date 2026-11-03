import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Callable

class SimulationClock:
    """
    Clock controlling the virtual simulation time.
    Supports play, pause, speed adjustment (1x, 10x, 60x), and time seeking.
    """
    def __init__(
        self,
        base_time: Optional[datetime] = None,
        speed: int = 10,
        horizon_hours: float = 6.0
    ):
        # Anchor simulation to standard IST monsoon reference time
        self.base_time = base_time or datetime(2026, 7, 15, 14, 0, 0, tzinfo=timezone.utc)
        self.speed = speed # Multiplier: 1 real sec = speed sim sec
        self.is_running = True
        self.elapsed_sim_seconds: float = 0.0
        self.last_wall_time: float = time.time()
        self.horizon_hours = horizon_hours
        self._listeners: List[Callable[[datetime, float], None]] = []

    def update(self) -> datetime:
        """Advance the simulation clock based on wall clock delta."""
        now_wall = time.time()
        wall_delta = now_wall - self.last_wall_time
        self.last_wall_time = now_wall
        
        if self.is_running:
            self.elapsed_sim_seconds += wall_delta * self.speed
            
        current_sim_time = self.get_current_time()
        for listener in self._listeners:
            listener(current_sim_time, self.elapsed_sim_seconds)
            
        return current_sim_time

    def get_current_time(self) -> datetime:
        """Returns the current simulated datetime."""
        return self.base_time + timedelta(seconds=self.elapsed_sim_seconds)

    def get_elapsed_hours(self) -> float:
        """Returns elapsed simulation hours."""
        return self.elapsed_sim_seconds / 3600.0

    def play(self):
        """Resume simulation time progression."""
        self.is_running = True
        self.last_wall_time = time.time()

    def pause(self):
        """Pause simulation progression."""
        self.is_running = False
        self.last_wall_time = time.time()

    def set_speed(self, speed: int):
        """Change speed multiplier (1, 10, 60)."""
        if speed in [1, 10, 60]:
            self.speed = speed

    def seek_seconds(self, seconds: float):
        """Seek to a specific elapsed simulation offset."""
        self.elapsed_sim_seconds = max(0.0, seconds)
        self.last_wall_time = time.time()

    def add_listener(self, listener: Callable[[datetime, float], None]):
        """Register a callback invoked whenever the clock updates."""
        self._listeners.append(listener)
