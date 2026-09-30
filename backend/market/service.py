"""Cached mandi quote interface. Offline prices are never described as live."""
from uuid import uuid4

from pydantic import BaseModel, Field
from backend.config import settings
from backend.db import Database, now_iso
from backend.domain.repository import markets
from backend.network import request_json


class QuotePayload(BaseModel):
    crop: str = Field(min_length=1, max_length=80)
    market: str = Field(min_length=1, max_length=80)
    price_per_kg: float = Field(gt=0, le=100000)
    previous_price: float = Field(gt=0, le=100000)
    source: str = "configured market provider"


def get_markets(db: Database, refresh: bool = False) -> list[dict]:
    if refresh and settings.market_api_url:
        try:
            raw = request_json("GET", settings.market_api_url)
            quotes = [QuotePayload.model_validate(q) for q in raw.get("quotes", [])]
            stamp = now_iso()
            with db.connection() as conn:
                for q in quotes:
                    conn.execute("INSERT INTO market_quotes VALUES (?,?,?,?,?,?,?)",
                                 (str(uuid4()), q.crop, q.market, q.price_per_kg, q.previous_price, stamp, q.source))
        except (ConnectionError, ValueError, TypeError) as exc:
            db.audit("market_refresh_failed", None, {"error": str(exc)})
    return markets(db)
