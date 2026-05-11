from fastapi import APIRouter

from app.api.routes.events import router as events_router

api_router = APIRouter(prefix="/api")
api_router.include_router(events_router)
