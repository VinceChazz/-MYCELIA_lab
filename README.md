# Root to Power

**An offline-first farm intelligence system for Indian smallholder farmers.** A single field-centred workspace connects crop health, simulated satellite indices, soil sensors, crop growth, precision irrigation, weather, mandi prices, input economics, renewable energy, a bioelectrochemical sensing node, and a multilingual assistant.

> **Prototype / demonstration, not a farm-control deployment.** All seeded readings, satellite observations, forecasts, prices, field geometry, savings and energy figures are illustrative. The pump controls **only a simulator**. Node voltage is an environmental signal, **not** a plant-health measurement. Agronomic estimates and possible causes are not diagnoses.

## Run it

Requirements: Python 3.11+, Node 20+.

```bash
# Terminal 1 — local API + SQLite, creates a five-field demo on first run
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — mobile-friendly UI with same-origin /api proxy
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

Open **http://localhost:5173**. No API keys, cloud account, physical sensor, satellite provider or pump are needed. The UI also has a bundled five-field demo if the local API cannot be reached.

To test the **installable production PWA** (all lazy modules and font assets cached for offline loading):

```bash
cd frontend && npm run build && cd ..
.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
# Open http://localhost:8000; install or visit online once, then disconnect and reload.
```

Use HTTPS outside localhost for service-worker registration. `frontend/dist` is served by FastAPI when present. Runtime SQLite lives in `data/local_database/` and is intentionally ignored by Git.

### Optional private configuration

Copy `.env.example` to `.env` at the **repository root**. Both are server-side; `.env` is Git-ignored. Leave `AI_API_KEY` / `AI_MODEL` empty for local rule-based advice. For an OpenAI-compatible service, set:

```dotenv
AI_API_KEY=your-server-side-key
AI_MODEL=your-model-name
AI_BASE_URL=https://api.openai.com/v1
```

The browser never receives this key. A missing, slow or failing AI API falls back to local rules and persistent local memory. Optional `WEATHER_API_URL`, `MARKET_API_URL` (normalized JSON feeds), `SYNC_TARGET_URL` / `SYNC_API_KEY`, and `SENSOR_INGEST_KEY` are described in `.env.example`. All optional upstream requests have timeouts, bounded retries, validated input and cached/local fallback.

## Three-to-five-minute demonstration

1. Open **Overview**; see the online badge, continuously simulated sensor values, five-field map and today's plan.
2. Select **Field 02 · Tomato** on the map or with **Explore Field 02**. Soil moisture is below target; the simulated satellite NDVI has declined over successive observations.
3. Open **Crop intelligence** and **Why this score?**. The panel separates *observed data*, *model inference* and *suggested advice*. It calls water stress a possibility, not a confirmed cause.
4. Open **Irrigation**. Review the rule-based 18-minute plan, tank/sensor/energy checks, solar availability and estimated litres/kWh. Click **Plan & confirm cycle**, type `Field 02`, check the farmer-approval box, and start the **simulated** pump. Pump flow becomes 16 L/min.
5. In **Settings**, click **Generate a reading** a few times (each tick represents three demo pump minutes), or wait for the 12-second sensor stream. See soil moisture and water usage rise. Stop the cycle or let it finish; emergency stop latches a fault until manually reset.
6. Click **Go offline**. Sensors, crop model, rules, map, charts and past prices remain available. Open **Ask Root AI** and ask a question. The local fallback responds; the conversation is retained on the device. You can change language to हिन्दी, తెలుగు, मराठी, தமிழ், ಕನ್ನಡ, বাংলা, ગુજરાતી or ਪੰਜਾਬੀ. If offline speech recognition isn't installed, the mic falls back to typing.
7. Click **Go online**, then **Alerts & sync**. Pending operations are acknowledged by the local SQLite server without replaying pump commands. Open **Weather** and **Markets & costs**, inspect source/timestamp and edit cultivation assumptions. Return to **Overview**.

For a repeatable run, **Settings → Reset local demo** resets local chats and demo data with confirmation; if the API is online it resets the server demo too.

## How it fits together

```text
                         FARM (SQLite / IndexedDB)
                          └── FIELD_01 ... FIELD_05
                              ├── crop + growth calendar
                              ├── validated sensor history
                              ├── multispectral index history + zones
                              ├── cached weather + market quotes
                              ├── irrigation history + pump state
                              ├── solar + Root-to-Power node history
                              └── farmer questions + local semantic memory

Sensors → input validation → local growth/health/irrigation models
        → DETERMINISTIC safety gate → AI explanation / farmer advice
        → explicit farmer confirmation → simulated controller
```

| Layer | Implemented modules | Replaceable boundary |
| --- | --- | --- |
| UI | `frontend/src/pages`, `components`, `hooks/useFarmSystem.ts` | Lazy-loaded React modules, responsive schematic field map, Recharts |
| On-device offline | `frontend/src/lib/offlineStore.ts`, `model.ts`, `demoData.ts`, `public/sw.js` | IndexedDB snapshot/outbox/chat with localStorage fallback; PWA precaches every built lazy chunk |
| Farm API / database | `backend/api`, `domain`, `db.py`, `demo.py` | FastAPI; SQLite in WAL mode with foreign keys, indexed histories and audit trail |
| Sensors | `backend/sensors`, `demo_stream.py` | `SensorProvider` protocol for future ESP32 / HTTP / LoRa / Bluetooth / Wi-Fi adapters; seeded and streamed telemetry |
| Crop/satellite | `backend/crop_models`, `satellite/provider.py` | Local crop calendar, health estimate, exploratory multi-signal anomaly model; cached mock NDVI/NDRE/EVI/NDWI observations; `SatelliteProvider` protocol |
| Water / energy | `backend/irrigation`, `energy` | `IrrigationController` protocol; demo-only controller; deterministic safety checks; solar and bioelectric trends |
| AI / memory | `backend/ai/ai_service.py`, `memory/memory_manager.py` | Advisory-only optional LLM API; offline multilingual rule fallback; versioned SQLite memory; `VectorIndex` protocol with deterministic local character-gram index (replaceable with FAISS) |
| Sync / feeds | `backend/synchronization`, `weather`, `market`, `network.py` | Idempotent device-to-server receipts, version-aware memory conflicts/tombstones, optional upstream outbox, cached feeds |

**Offline semantics:** Browser actions and readings go to IndexedDB before any request. The UI works with no API using bundled farm data, local models and the cached last snapshot. On reconnection, the queue uploads with unique operation IDs and removes a record **only after server acknowledgment**. SQLite persists received data and local memories. “Sync complete” means *device → local server* confirmation; a cloud uplink is **not configured by default** and is shown separately if enabled. Offline irrigation events sync as **historical records only**, never as delayed actuator commands.

**Provenance:** Simulated/cached source and observation age are visible. Satellite observation age and weather/market timestamps do not silently become “live” when the sensor stream advances. Confidence and possible causes are labelled as inferences. Exploratory node-voltage correlations are computed only from paired sensor samples with crop stage and satellite trend as separate context; they do **not** establish causation or diagnose a plant.

## Safety and security notes

- The AI can explain a recommendation but cannot call the pump controller. Start requires a farmer-confirmation flag, the **exact field name**, and independent backend checks. Irrigation outside the deterministic crop/water plan is denied.
- The backend rejects stale/suspect readings, implausible soil moisture, cycles over 45 minutes or over the field plan, tank level below 15%, unavailable solar/battery, pump faults, concurrent starts and emergency latches. Flow is monitored **after** start; a no-flow condition latches emergency stop. The simulated backend stream enforces duration even if no browser is open.
- No physical pump adapter is present. With `DEMO_MODE=false`, `start_irrigation` fails closed **even with an operator key** until an independently audited hardware adapter is installed. Non-demo / hardware-origin sensor ingestion requires `SENSOR_INGEST_KEY`.
- Sensor ingestion, AI advice, confirmations, pump actions, errors and sync receipts are audited. API credentials remain server-side and are never committed or bundled.
- **Before handling real farm data or hardware:** add farmer/operator authentication, per-farm authorization, TLS, device enrollment, CSRF/rate limits, storage encryption/backup, calibrated sensors, official provider contracts, an independent pump watchdog/fail-safe and field validation by agronomists. The openly accessible demo endpoints are **not** multi-tenant production security.

## Test

```bash
.venv/bin/python -m pytest -q backend/tests   # safety, memory, sync, multilingual fallback, full demo path
cd frontend
npm run typecheck
npm test                                      # offline model / safety regression tests
npm run build                                 # includes offline precache manifest
```

The production PWA has also been exercised by loading online, disabling the browser network, reloading the shell, opening a lazily loaded crop module and receiving a local assistant answer. The development Vite server intentionally does not register the worker to avoid caching stale hot-reload assets.
