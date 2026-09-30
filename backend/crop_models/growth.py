"""Transparent local phenology estimates; not a substitute for an agronomist."""
from datetime import timedelta

from backend.db import now_iso, parse_time

# Day boundaries and baseline daily water need (mm/day) are illustrative demo assumptions.
CROP_MODELS = {
    "Tomato": ([20, 42, 78, 105], 4.8, 110),
    "Rice": ([20, 65, 95, 120], 5.6, 125),
    "Chilli": ([18, 38, 85, 125], 4.2, 130),
    "Cotton": ([20, 60, 110, 155], 4.5, 165),
    "Groundnut": ([18, 36, 72, 102], 3.8, 110),
}
STAGES = ["Establishment", "Vegetative", "Flowering", "Fruit / grain fill", "Maturity"]


def model_growth(field: dict, sensor: dict, weather: dict) -> dict:
    days = max(0, (parse_time(now_iso()) - parse_time(field["sown_at"])).days)
    bounds, base_need, harvest_day = CROP_MODELS.get(field["crop"], CROP_MODELS["Tomato"])
    stage = STAGES[next((i for i, boundary in enumerate(bounds) if days < boundary), 4)]
    heat_factor = 1.15 if weather["temperature"] > 33 else 1.0
    water_mm = round(base_need * heat_factor * (1.1 if stage == "Flowering" else 1), 1)
    stress_days = max(0, round((30 - sensor["soil_moisture"]) / 4))
    harvest = parse_time(field["sown_at"]) + timedelta(days=harvest_day)
    return {
        "stage": stage, "days_after_sowing": days, "water_requirement_mm_day": water_mm,
        "stress_accumulation_days_est": stress_days,
        "expected_development": "Monitor flowers and fruit set" if stage == "Flowering" else
                                "Growth expected to continue with adequate water and nutrients",
        "harvest_window_start": (harvest - timedelta(days=7)).date().isoformat(),
        "harvest_window_end": (harvest + timedelta(days=10)).date().isoformat(),
        "model": "local simplified crop calendar", "certainty": "estimate",
    }
