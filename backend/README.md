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

Copy `.env.example` to `.env` and fill in the local database, EMQX, and secret
values as those integrations are configured. The local `.env` is ignored by Git.

The API is available at `http://127.0.0.1:8000`; interactive API documentation
is at `/docs`. The `/health` endpoint provides a basic service health response.

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
