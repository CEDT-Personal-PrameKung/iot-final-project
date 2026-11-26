# Smart Parking

IoT smart parking system: edge sensors detect vehicles, a gateway runs camera-based vehicle detection, and a cloud backend serves a real-time parking dashboard.

A monorepo with five parts:

- **ESP32-S3 firmware** — reads an ultrasonic distance sensor (HY-SRF05) and an IR obstacle sensor (KY-032), publishes readings over MQTT, and receives actuator commands.
- **Raspberry Pi 5 gateway** — reads BME280 environment data and an LDR light sensor, captures camera images, and runs YOLO/OpenCV vehicle detection; publishes telemetry and detection metadata over MQTT.
- **Cloud backend** — Python/FastAPI service that consumes MQTT telemetry, applies parking business logic, persists data, and serves REST + WebSocket APIs.
- **Frontend dashboard** — Next.js (App Router, TypeScript, Tailwind) showing parking availability, device status, sensor data, and analytics.
- **ML model training** — YOLOv11 toy-car detection model trained from a [Roboflow dataset](https://universe.roboflow.com/shyam-47kjr/my-first-project-rmlqk), deployed to the gateway for vehicle detection.

## Architecture

```mermaid
flowchart TB
    subgraph EDGE["EDGE LAYER - On Site"]
        subgraph SENSOR["Sensor Node"]
            ESP["ESP32-S3"]
            US["HY-SRF05 Ultrasonic"]
            IR["KY-032 IR Obstacle"]
            ESP --- US
            ESP --- IR
        end

        subgraph GATEWAY["Gateway Node"]
            PI["Raspberry Pi 5"]
            BME["BME280"]
            LDR["LDR + ADC (e.g. ADS1115)"]
            CAM["Camera"]
            YOLO["YOLO + OpenCV"]
            PI --- BME
            PI --- LDR
            PI --- CAM
            CAM --> YOLO
        end
    end

    subgraph CLOUD["CLOUD LAYER"]
        MQTT["EMQX Cloud<br/>MQTT over TLS"]

        subgraph BACKEND["Backend Hosting"]
            API["FastAPI REST API"]
            WORKER["MQTT Publisher / Subscriber Worker"]
            WS["WebSocket"]
        end

        DB[("Neon PostgreSQL")]
        FE["Vercel<br/>Next.js Dashboard"]
    end

    ESP <-->|"MQTT over TLS"| MQTT
    PI <-->|"MQTT over TLS"| MQTT
    MQTT <-->|"MQTT"| WORKER
    API --> DB
    WORKER --> API
    API --> WS
    FE <-->|"HTTPS / REST"| API
    FE <-->|"WebSocket"| WS
```

MQTT is the only device-to-cloud transport. The frontend never talks to the broker directly — it consumes backend REST and WebSocket APIs. See [AGENTS.md](AGENTS.md) for the full architecture rules and [MQTT topic convention](AGENTS.md#initial-mqtt-topic-convention).

## Tech Stack

| Layer | Technology |
|---|---|
| Sensor node | ESP32-S3, C++ (PlatformIO) |
| Gateway node | Raspberry Pi 5, Python, OpenCV, YOLO |
| MQTT broker | EMQX Cloud (TLS) |
| Backend | Python, FastAPI, SQLAlchemy, Paho-MQTT |
| Database | Neon serverless PostgreSQL |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS |
| ML training | Ultralytics YOLOv11, PyTorch (CUDA) |
| Hosting | Render (backend + MQTT worker), Vercel (frontend) |

## Repository Layout

```text
├── backend/           # FastAPI cloud backend (implemented)
├── frontend/          # Next.js dashboard (implemented)
├── models/            # YOLOv11 toy-car detection training (implemented)
├── infrastructure/    # Dockerfiles and deployment config (backend done)
├── firmware/          # ESP32-S3 firmware (planned)
├── gateway/           # Raspberry Pi 5 application (planned)
└── docs/              # Architecture, API, and MQTT contracts (planned)
```

## Current Status

Implemented:

- **Backend** — JWT auth and roles, health probes (`/health`, `/health/neon`, `/health/tiger`), EMQX Cloud TLS MQTT subscriber/publisher worker (`src.mqtt.worker`), Pydantic payload validation and deduplication for all 5 telemetry topics, Neon PostgreSQL + Tiger Cloud (TimescaleDB) Alembic migrations and persistence, REST APIs (`/parking/overview`, `/parking/lighting`, `/reports/activity`, `/configs`), and real-time WebSocket streaming (`WS /ws/parking`).
- **Frontend** — login/register pages, live `/parking` map, `/reports` activity logs, and admin `/configs` dashboard connected to backend REST APIs and WebSocket stream (with offline mock fallback).
- **ESP32 firmware** — YD-ESP32-23 telemetry & lighting firmware (`firmware/yd-esp32-23/`).
- **Models** — complete training pipeline: dataset download from Roboflow, CUDA training on YOLOv11, evaluation, prediction. Latest model reaches ~0.97 mAP50-95 on the held-out test split.
- **Infrastructure** — backend Dockerfile and `docker-compose.yml` for both the FastAPI API and standalone MQTT worker.

Planned / In Progress: gateway repository sync under `gateway/`, optional barrier actuator MQTT command handling, and production deployment configuration.

## Getting Started

### Backend

```sh
cd backend
cp .env.example .env   # set DATABASE_URL, TELEMETRY_DATABASE_URL, EMQX_*, APP_SECRET_KEY
uv sync
uv run alembic upgrade head
uv run alembic -c telemetry-alembic.ini upgrade head
uv run fastapi dev src/main.py
```

Run the standalone MQTT subscriber worker in a second terminal:

```sh
cd backend
uv run python -m src.mqtt.worker
```

Dev API runs on port `8000` (`http://127.0.0.1:8000/docs`, `ws://127.0.0.1:8000/ws/parking`).

### Frontend

```sh
cd frontend
npm install
cp .env.example .env   # set BACKEND_API_URL and NEXT_PUBLIC_PARKING_WS_URL
npm run dev
```

Dev server runs on port `3000`.

### Model Training

See [models/README.md](models/README.md) for the full guide. Short version:

```sh
cd models
python -m venv .venv && .venv/Scripts/Activate   # Windows; `source .venv/bin/activate` on Linux
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu132
pip install -r requirements.txt
export ROBOFLOW_API_KEY="<your-key>"
python download_dataset.py
python train.py --batch 8        # RTX 3050 4GB-class GPU
python predict.py --source path/to/photo.jpg
```

### Full Stack via Docker

```sh
cp backend/.env.example backend/.env   # configure Neon, Tiger Cloud, EMQX, and APP_SECRET_KEY
docker compose up --build
```

## Documentation

- [AGENTS.md](AGENTS.md) — confirmed architecture decisions, coding guidelines, MQTT topic convention.
- [docs/mqtt/topics.md](docs/mqtt/topics.md) — active MQTT topics, payload schemas, QoS, and retain behavior.
- [docs/architecture/esp32-telemetry.md](docs/architecture/esp32-telemetry.md) — YD-ESP32-23 environmental telemetry and lighting setup.
- [backend/README.md](backend/README.md) — backend development, migrations, MQTT worker, and deployment notes.
- [frontend/README.md](frontend/README.md) — frontend development notes.
- [models/README.md](models/README.md) — dataset, CUDA setup, training, evaluation, and prediction guide.
