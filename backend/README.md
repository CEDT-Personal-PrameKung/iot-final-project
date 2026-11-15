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
`src.database.get_db`. The `/health` endpoint runs a database connectivity
check and returns HTTP 503 if the database is missing or unreachable. The local
`.env` is ignored by Git.

## Database migrations

Apply the user schema after configuring `DATABASE_URL`:

```sh
uv run alembic upgrade head
```

The migrations create the `users` table with a UUID primary key,
case-insensitive unique email index, password hash, `admin` or `guest` role
(defaults to `guest`), active flag, and timestamps. The application does not
create or alter tables automatically at startup.

The API is available at `http://127.0.0.1:8000`; interactive API documentation
is at `/docs`.

Register a guest account with `POST /auth/register` using an email and a
password of 8–128 characters. Emails are normalized to lowercase, passwords
are stored as Argon2 hashes, and duplicate emails return HTTP 409. The endpoint
does not accept a role; public registrations always receive the `guest` role.

Set `APP_SECRET_KEY` to a unique, random secret (for example, generate one with
`openssl rand -hex 32`) before using `POST /auth/login`. Login accepts an email
and password and returns a signed bearer token. Tokens expire after
`ACCESS_TOKEN_EXPIRE_MINUTES` (30 by default). Send the token as
`Authorization: Bearer <token>` to access `GET /auth/me`.

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
- Uvicorn serves the application in production.
- Pydantic Settings is available for environment-based configuration.

Use `uv add <package>` and `uv remove <package>` to manage dependencies. Commit
`uv.lock` so local and deployed environments resolve the same versions.
