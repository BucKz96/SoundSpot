from fastapi import APIRouter, HTTPException, Request

from app.core.rate_limit import SHOTGUN_SEARCH_IP, require_rate_limit
from app.schemas.event import EventResponse
from app.services.shotgun_service import ShotgunAPIError, search_shotgun_events
from app.utils.city_normalizer import normalize_city_name

router = APIRouter(prefix="/events/shotgun", tags=["shotgun-events"])


@router.get("/search", response_model=list[EventResponse])
async def search_shotgun_events_route(
    request: Request,
    city: str | None = None,
) -> list[EventResponse]:
    require_rate_limit(request, SHOTGUN_SEARCH_IP)

    try:
        city_query = normalize_city_name(city) if city and city.strip() else None
        return await search_shotgun_events(city_query)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ShotgunAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
