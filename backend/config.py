"""Server-only configuration. API credentials are never sent to a browser."""
from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def _path(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else ROOT / path)


@dataclass(frozen=True)
class Settings:
    db_path: str = _path(os.getenv("ROOT_TO_POWER_DB", "data/local_database/root_to_power.sqlite"))
    demo_mode: bool = os.getenv("DEMO_MODE", "true").lower() == "true"
    ai_api_key: str = os.getenv("AI_API_KEY", "")
    ai_model: str = os.getenv("AI_MODEL", "")
    ai_base_url: str = os.getenv("AI_BASE_URL", "https://api.openai.com/v1")
    pump_operator_key: str = os.getenv("PUMP_OPERATOR_KEY", "")
    sensor_ingest_key: str = os.getenv("SENSOR_INGEST_KEY", "")
    sync_target_url: str = os.getenv("SYNC_TARGET_URL", "")
    sync_api_key: str = os.getenv("SYNC_API_KEY", "")
    weather_api_url: str = os.getenv("WEATHER_API_URL", "")
    market_api_url: str = os.getenv("MARKET_API_URL", "")


settings = Settings()
