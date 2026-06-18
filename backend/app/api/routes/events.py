import logging

from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.rate_limit import (
    EVENTS_DISCOVERY_IP,
    EVENTS_LIST_IP,
    EVENTS_SEARCH_IP,
    require_rate_limit,
)
from app.schemas.event import EventResponse
from app.services.discovery_service import DiscoveryAPIError, get_discovery_events
from app.services.event_aggregator_service import (
    EventAggregationError,
    search_events_by_city_across_sources,
)
from app.services.ticketmaster_service import (
    TicketmasterAPIError,
    search_events_by_artist,
)
from app.utils.city_normalizer import normalize_city_name

router = APIRouter(prefix="/events", tags=["events"])
logger = logging.getLogger(__name__)


def has_discovery_provider_credentials() -> bool:
    return bool(
        (settings.ticketmaster_api_key or "").strip()
        or (settings.shotgun_api_key or "").strip()
        or (
            (settings.openagenda_api_key or "").strip()
            and settings.discovery_openagenda_seed_agenda_uids
        )
    )


async def get_discovery_events_or_empty() -> list[EventResponse]:
    if not has_discovery_provider_credentials():
        return []

    try:
        return await get_discovery_events()
    except DiscoveryAPIError:
        return []


@router.get("", response_model=list[EventResponse])
async def list_events(request: Request) -> list[EventResponse]:
    require_rate_limit(request, EVENTS_LIST_IP)
    return await get_discovery_events_or_empty()


@router.get("/discovery", response_model=list[EventResponse])
async def discovery_events(request: Request) -> list[EventResponse]:
    require_rate_limit(request, EVENTS_DISCOVERY_IP)

    try:
        return await get_discovery_events()
    except DiscoveryAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/search", response_model=list[EventResponse])
async def search_events(
    request: Request,
    city: str | None = None,
    artist: str | None = None,
) -> list[EventResponse]:
    require_rate_limit(request, EVENTS_SEARCH_IP)

    try:
        if city and city.strip():
            city_query = normalize_city_name(city)
            return await search_events_by_city_across_sources(city_query)

        if artist and artist.strip():
            return await search_events_by_artist(artist.strip())

        return await get_discovery_events_or_empty()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TicketmasterAPIError as exc:
        logger.warning("Ticketmaster search failed error_type=%s", type(exc).__name__)
        return []
    except EventAggregationError as exc:
        logger.warning("City search aggregation failed error_type=%s", type(exc).__name__)
        return []
