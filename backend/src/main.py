from fastapi import FastAPI, responses
from scalar_doc import ScalarDoc
from src.api.health import router as health_router
from src.features.users.router import router as users_router

app = FastAPI(
    title="Smart Parking API",
    description="Backend API for the Smart Parking IoT application.",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


app.include_router(health_router)
app.include_router(users_router)

docs = ScalarDoc.from_spec(spec=app.openapi_url, mode="url")


@app.get("/docs", include_in_schema=False)
def get_docs() -> responses.HTMLResponse:
    return responses.HTMLResponse(docs.to_html())
