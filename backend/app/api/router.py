from fastapi import APIRouter

from app.api.routes.artists import router as artists_router
from app.api.routes.auth import router as auth_router
from app.api.routes.events import router as events_router
from app.api.routes.shotgun_events import router as shotgun_events_router

api_router = APIRouter(prefix="/api")
api_router.include_router(artists_router)
api_router.include_router(auth_router)
api_router.include_router(events_router)
api_router.include_router(shotgun_events_router)
