from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="SoundSpot API")
app.include_router(api_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": "SoundSpot"}
