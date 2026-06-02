from fastapi import APIRouter

from app.api.routes.events import router as events_router
from app.api.routes.shotgun_events import router as shotgun_events_router

api_router = APIRouter(prefix="/api")
api_router.include_router(events_router)
api_router.include_router(shotgun_events_router)
