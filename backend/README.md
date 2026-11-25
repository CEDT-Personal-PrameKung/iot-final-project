# Smart Parking Backend

FastAPI service for the Smart Parking application. Dependencies and the lockfile
are managed with [uv](https://docs.astral.sh/uv/).

## Development

From this directory, install the locked dependencies and start the development
server:

```sh
uv sync
uv run fastapi dev src/main.py
```

Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon PostgreSQL
connection string (including `sslmode=require`). The backend uses SQLAlchemy
with the psycopg 3 driver and provides request-scoped sessions through
`src.database.get_db`. Use `/health/neon` to check Neon or `/health/tiger` to
check Tiger Cloud. Each endpoint returns HTTP 200 if its database is reachable,
or HTTP 503 if it is missing or unreachable. The existing `/health` endpoint
also checks Neon. The local `.env` is ignored by Git.

In development, an empty `CORS_ORIGINS` allows the Next.js frontend at
`http://localhost:3000` and `http://127.0.0.1:3000`. An explicit
`CORS_ORIGINS` overrides these defaults. For deployment, set
`APP_ENV=production` and set `CORS_ORIGINS` in the backend host's environment
to a comma-separated list of frontend origins, without trailing slashes
(for example, `https://your-app.vercel.app`). Set `BACKEND_API_URL` in the frontend
host's environment settings to the backend's base URL (for example,
`https://your-api.onrender.com`).

## Database migrations

Apply the user schema after configuring `DATABASE_URL`:

```sh
uv run alembic upgrade head
```

The migrations create the `users` table with a UUID primary key,
case-insensitive unique email index, password hash, `admin` or `guest` role
(defaults to `guest`), active flag, and timestamps. The application does not
create or alter tables automatically at startup.

The API is available at `http://127.0.0.1:8000`; Scalar API documentation is
available at `/docs`, backed by FastAPI's `/openapi.json` schema.

Register a guest account with `POST /auth/register` using an email and a
password of 8–128 characters. Emails are normalized to lowercase, passwords
are stored as Argon2 hashes, and duplicate emails return HTTP 409. The endpoint
does not accept a role; public registrations always receive the `guest` role.

Set `APP_SECRET_KEY` to a unique, random secret (for example, generate one with
`openssl rand -hex 32`) before using `POST /auth/login`. Login accepts an email
and password and returns a signed bearer token. Tokens expire after
`ACCESS_TOKEN_EXPIRE_MINUTES` (30 by default). Send the token as
`Authorization: Bearer <token>` to access `GET /auth/me`.

## Tiger Cloud telemetry

Keep both connection URLs in the backend `.env` or in the backend host's
environment settings. `DATABASE_URL` connects to Neon for application data.
`TELEMETRY_DATABASE_URL` connects to a separate Tiger Cloud PostgreSQL service
with TimescaleDB enabled. Use the connection URL supplied by Tiger Cloud,
including its port and TLS options. Leaving the telemetry URL blank keeps
the existing Neon-backed API available.

From the backend directory, apply the Tiger Cloud schema separately:

```sh
uv run alembic -c telemetry-alembic.ini upgrade head
```

This creates the `environment_readings` hypertable. It uses the ESP32's
measurement timestamp and device ID to ignore repeat deliveries of the same
sample. An MQTT worker can call
`src.features.sensors.environment.record_environment_reading` with the raw
payload from `parking/sensor/environment`. The worker and broker subscription
are still needed for automatic ingestion.

## Docker

From the repository root, create `backend/.env` from the example if needed and
start the backend container:

```sh
cp -n backend/.env.example backend/.env
docker compose up --build backend
```

The container runs as a non-root user. Compose maps local port `8000`; on Render,
the server uses the platform-provided `PORT`. Compose reads local configuration
from `backend/.env`, and the Docker build excludes environment files from the
image.

## Dependencies

- FastAPI provides the HTTP API and development CLI.
- `scalar_doc` renders the OpenAPI schema as interactive Scalar documentation.
- Uvicorn serves the application in production.
- Pydantic Settings is available for environment-based configuration.

Use `uv add <package>` and `uv remove <package>` to manage dependencies. Commit
`uv.lock` so local and deployed environments resolve the same versions.
