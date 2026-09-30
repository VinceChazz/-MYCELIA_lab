"""Reproducible, clearly labelled simulated farm. Nothing here is a live feed."""
from datetime import datetime, timedelta, timezone
import json

from backend.db import Database


# Gentle deterministic noise avoids perfectly straight, misleadingly certain demo correlations.
JITTER = [.10, -.04, .06, -.07, .03, -.05, .09, -.02, .04, -.08, .02, 0]

FIELD_SEEDS = [
    ("FIELD_01", "Field 01", "Rice", "Swarna", 66, 1.4, "Clay loam", "Drip", 31.5, 0.79, 0.49, 85,
     [[44,67],[329,53],[326,196],[58,211]]),
    ("FIELD_02", "Field 02", "Tomato", "Arka Rakshak", 54, 0.9, "Sandy loam", "Drip", 23.5, 0.58, 0.47, 78,
     [[344,53],[588,42],[611,180],[338,195]]),
    ("FIELD_03", "Field 03", "Chilli", "Teja", 43, 0.7, "Red loam", "Drip", 26.8, 0.62, 0.44, 72,
     [[607,40],[793,68],[785,204],[625,180]]),
    ("FIELD_04", "Field 04", "Cotton", "NCS-145", 71, 1.2, "Black soil", "Furrow", 34.4, 0.76, 0.51, 91,
     [[56,225],[324,209],[326,377],[41,375]]),
    ("FIELD_05", "Field 05", "Groundnut", "Kadiri-6", 40, 0.8, "Sandy loam", "Sprinkler", 29.6, 0.71, 0.46, 80,
     [[340,211],[626,195],[788,220],[776,370],[339,376]]),
]


def ts(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seed_demo(db: Database) -> None:
    now = datetime.now(timezone.utc)
    with db.connection() as conn:
        if conn.execute("SELECT 1 FROM farms LIMIT 1").fetchone():
            return
        conn.execute(
            "INSERT INTO farms VALUES (?,?,?,?,?,?,?)",
            ("DEMO_FARM", "Demo Farm", "Pedakakani", "Guntur", "Andhra Pradesh", 16.377, 80.497),
        )
        for idx, (fid, name, crop, variety, days, area, soil, method, moisture, ndvi, voltage, battery, boundary) in enumerate(FIELD_SEEDS):
            last_irr = now - timedelta(hours=31 if fid == "FIELD_02" else 22 if fid == "FIELD_03" else 16)
            conn.execute(
                "INSERT INTO fields VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (fid, "DEMO_FARM", name, crop, variety, ts(now-timedelta(days=days)), area, soil,
                 method, json.dumps(boundary), ts(last_irr)),
            )
            previous_crop = ["Groundnut", "Chilli", "Rice", "Groundnut", "Rice"][idx]
            previous_harvest = now - timedelta(days=days + 35)
            conn.execute("INSERT INTO crop_cycles VALUES (?,?,?,?,?,?,?,?,?)",
                         (f"demo-cycle-{fid}", fid, previous_crop, "Local variety",
                          ts(previous_harvest-timedelta(days=108)), ts(previous_harvest),
                          [1780, 820, 960, 1240, 740][idx],
                          "Previous season, simulated farmer record", "simulated farm history"))
            conn.execute(
                "INSERT INTO pump_states VALUES (?,?,?,?,?,?,?,?)",
                (fid, "OFF", 0, 0, None, 0, [310,210,135,365,220][idx], [28,24,19,31,26][idx]),
            )
            for n in range(12):
                # 12 readings at 15-minute intervals; Field 02 has a sustained dry-down.
                age = 11 - n
                m = moisture + (age * (0.85 if idx == 1 else 0.37 if idx == 2 else 0.10)) + JITTER[n]
                observed = now - timedelta(minutes=age * 15)
                conn.execute(
                    "INSERT INTO sensor_readings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (f"demo-sensor-{fid}-{n}", fid, ts(observed), round(m, 1),
                     round(26.2 + idx*.4 + n*.08 + JITTER[n]*.4, 1),
                     round(31.4 + n*.12 + JITTER[(n+3)%12]*.6, 1),
                     round(68 - n*.3 + JITTER[n]*.8, 1), 0, 755 + n*11, 1.2, 6.6, 82,
                     "OFF", battery, 1.8, 0, round(voltage + age*.002 + JITTER[(n+6)%12]*.04, 3), .18, "simulated", "valid"),
                )
            trend = (
                [.71,.74,.75,.73,.69,.63,.58] if idx == 1 else
                [.61,.63,.65,.66,.65,.64,.62] if idx == 2 else
                [ndvi-.08,ndvi-.06,ndvi-.04,ndvi-.03,ndvi-.02,ndvi-.01,ndvi]
            )
            for n, value in enumerate(trend):
                observed = now - timedelta(days=(6-n)*5, hours=6)
                conn.execute(
                    "INSERT INTO satellite_observations VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (f"demo-sat-{fid}-{n}", fid, ts(observed), value, round(value*.68, 2),
                     round(value*.87, 2), round((value-.09)*.72, 2), 5.5,
                     json.dumps(["healthy","moderate stress","severe stress","declining vegetation","anomalous zone"] if idx == 1
                                else ["healthy","recently irrigated"] if idx == 0
                                else ["healthy","moderate stress"] if idx == 2 else ["healthy"]),
                     "simulated satellite"),
                )
            for n in range(8):
                conn.execute(
                    "INSERT INTO energy_readings VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (f"demo-energy-{fid}-{n}", fid, ts(now-timedelta(hours=7-n)),
                     round([.35,.48,.83,1.27,1.67,1.8,1.75,1.8][n], 2),
                     round([.4,.9,1.6,2.5,3.7,4.8,5.6,6.4][n], 2),
                     round([.2,.3,.5,.8,1.2,1.5,1.8,2.1][n], 2),
                     battery, round(voltage + (7-n)*.004, 3), round(.09+n*.015, 3),
                     "CONNECTED", "simulated"),
                )
            conn.execute(
                "INSERT INTO irrigation_events VALUES (?,?,?,?,?,?,?,?,?,?)",
                (f"demo-irrigation-{fid}", fid, ts(last_irr), ts(last_irr+timedelta(minutes=19)),
                 19, 304, .27, "simulated", "completed", "demo seed"),
            )
        forecast = [
            {"day": "Today", "temperature": 32, "rain_probability": 12, "condition": "Partly cloudy", "rainfall_mm": 0},
            {"day": "Tomorrow", "temperature": 34, "rain_probability": 18, "condition": "Sunny intervals", "rainfall_mm": 0},
            {"day": "Friday", "temperature": 31, "rain_probability": 64, "condition": "Possible showers", "rainfall_mm": 4},
            {"day": "Saturday", "temperature": 30, "rain_probability": 72, "condition": "Showers", "rainfall_mm": 7},
        ]
        conn.execute("INSERT INTO weather_snapshots VALUES (?,?,?,?,?,?,?,?,?)",
                     ("demo-weather-1", ts(now), 32, 66, 0, 9, 12, json.dumps(forecast), "simulated weather"))
        for crop, market, price, previous in [
            ("Tomato", "Guntur", 24, 21), ("Rice", "Guntur", 32, 31),
            ("Chilli", "Guntur", 86, 91), ("Cotton", "Tenali", 68, 66),
            ("Groundnut", "Guntur", 62, 60),
        ]:
            conn.execute("INSERT INTO market_quotes VALUES (?,?,?,?,?,?,?)",
                         (f"demo-market-{crop.lower()}", crop, market, price, previous,
                          ts(now-timedelta(hours=2)), "simulated mandi price"))
        conn.execute("INSERT INTO audit_events (timestamp,kind,field_id,detail_json) VALUES (?,?,?,?)",
                     (ts(now), "demo_seeded", None, json.dumps({"fields": 5, "source": "simulated"})))
