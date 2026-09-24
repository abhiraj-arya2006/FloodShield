from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FloodShield"
    VERSION: str = "0.2.0"
    API_V1_STR: str = "/api"
    SIMULATION_MODE: bool = True
    
    # Environment & Paths
    ROOT_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent
    CONFIG_DIR: Path = ROOT_DIR / "config"
    ARTIFACTS_DIR: Path = ROOT_DIR / "ml" / "artifacts"
    
    # Grid & Simulation
    CELL_SIZE_M: int = 500 # Default 500m
    RANDOM_SEED: int = 42
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Alert System
    ALERT_CHANNELS_ENABLED: bool = False # Strictly False in prototype
    
    # Model settings
    ACTIVE_MODEL: str = "xgboost" # "xgboost" or "surrogate"
    
    model_config = {"env_file": ".env", "extra": "allow"}

settings = Settings()
