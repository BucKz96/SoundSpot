import sys
import unittest
from pathlib import Path
from time import monotonic
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.rate_limit import clear_rate_limit_store  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.event import EventResponse  # noqa: E402
from app.services import discovery_service, event_aggregator_service  # noqa: E402
from app.services.event_aggregator_service import EventAggregationError  # noqa: E402


def search_event(
    event_id: str = "ticketmaster:event-1",
    source: str = "ticketmaster",
    city: str = "London",
) -> EventResponse:
    return EventResponse(
        id=event_id,
        name="Search Test Event",
        artist="Test Artist",
        city=city,
        country="United Kingdom",
        venue="Test Venue",
        date="2099-07-04",
        time="20:00",
        latitude=51.5074,
        longitude=-0.1278,
        ticket_url="https://example.com/event",
        source=source,
    )


def reset_discovery_cache() -> None:
    discovery_service._cached_events = []
    discovery_service._cache_expires_at = 0.0
    discovery_service._has_cached_response = False
    discovery_service._cache_ticketmaster_attempted = False
    discovery_service._cache_openagenda_attempted = False


class EventSearchAggregatorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        reset_discovery_cache()

    def tearDown(self) -> None:
        reset_discovery_cache()

    async def test_cached_city_results_are_returned_before_live_providers(self) -> None:
        london_event = search_event(event_id="ticketmaster:london", city="London")
        paris_event = search_event(event_id="ticketmaster:paris", city="Paris")
        discovery_service._cached_events = [london_event, paris_event]
        discovery_service._has_cached_response = True
        discovery_service._cache_expires_at = monotonic() + 60

        ticketmaster_mock = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=ticketmaster_mock,
            ),
            patch(
                "app.services.event_aggregator_service.search_shotgun_events",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.event_aggregator_service.search_openagenda_events_by_city",
                new=AsyncMock(return_value=[]),
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "London"
            )

        self.assertEqual(events, [london_event])
        ticketmaster_mock.assert_not_awaited()

    async def test_ticketmaster_rate_limited_uses_stale_cached_results(self) -> None:
        cached_event = search_event(event_id="ticketmaster:london", city="London")
        discovery_service._cached_events = [cached_event]
        discovery_service._has_cached_response = True
        discovery_service._cache_expires_at = monotonic() - 60

        ticketmaster_mock = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.event_aggregator_service.is_ticketmaster_rate_limited",
                return_value=True,
            ),
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=ticketmaster_mock,
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "London"
            )

        self.assertEqual(events, [cached_event])
        ticketmaster_mock.assert_not_awaited()

    async def test_empty_cache_and_ticketmaster_rate_limited_returns_empty_list(self) -> None:
        ticketmaster_mock = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.event_aggregator_service.is_ticketmaster_rate_limited",
                return_value=True,
            ),
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=ticketmaster_mock,
            ),
            patch(
                "app.services.event_aggregator_service.search_shotgun_events",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.event_aggregator_service.search_openagenda_events_by_city",
                new=AsyncMock(return_value=[]),
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "London"
            )

        self.assertEqual(events, [])
        ticketmaster_mock.assert_not_awaited()

    async def test_unknown_city_with_no_provider_results_returns_empty_list(self) -> None:
        with (
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.event_aggregator_service.search_shotgun_events",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.event_aggregator_service.search_openagenda_events_by_city",
                new=AsyncMock(return_value=[]),
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "Unknown City"
            )

        self.assertEqual(events, [])

    async def test_provider_exception_returns_partial_results(self) -> None:
        event = search_event(source="shotgun")

        with (
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=AsyncMock(side_effect=RuntimeError("Ticketmaster failed")),
            ),
            patch(
                "app.services.event_aggregator_service.search_shotgun_events",
                new=AsyncMock(return_value=[event]),
            ),
            patch(
                "app.services.event_aggregator_service.search_openagenda_events_by_city",
                new=AsyncMock(return_value=[]),
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "London"
            )

        self.assertEqual(events, [event])

    async def test_all_provider_exceptions_return_empty_list(self) -> None:
        with (
            patch(
                "app.services.event_aggregator_service.search_events_by_city",
                new=AsyncMock(side_effect=RuntimeError("Ticketmaster failed")),
            ),
            patch(
                "app.services.event_aggregator_service.search_shotgun_events",
                new=AsyncMock(side_effect=RuntimeError("Shotgun failed")),
            ),
            patch(
                "app.services.event_aggregator_service.search_openagenda_events_by_city",
                new=AsyncMock(side_effect=RuntimeError("OpenAgenda failed")),
            ),
        ):
            events = await event_aggregator_service.search_events_by_city_across_sources(
                "London"
            )

        self.assertEqual(events, [])


class EventSearchRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_rate_limit_enabled = settings.rate_limit_enabled
        settings.rate_limit_enabled = False
        clear_rate_limit_store()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        settings.rate_limit_enabled = self.original_rate_limit_enabled
        clear_rate_limit_store()
        reset_discovery_cache()

    def test_search_city_aliases_do_not_return_502(self) -> None:
        with patch(
            "app.api.routes.events.search_events_by_city_across_sources",
            new=AsyncMock(return_value=[]),
        ) as search_mock:
            for city in ("London", "Londres", "Londre"):
                response = self.client.get("/api/events/search", params={"city": city})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), [])

        self.assertEqual(
            [call.args[0] for call in search_mock.await_args_list],
            ["London", "London", "London"],
        )

    def test_search_route_returns_partial_provider_results(self) -> None:
        event = search_event()

        with patch(
            "app.api.routes.events.search_events_by_city_across_sources",
            new=AsyncMock(return_value=[event]),
        ):
            response = self.client.get("/api/events/search", params={"city": "London"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["id"], event.id)

    def test_search_route_returns_empty_for_recoverable_aggregation_error(self) -> None:
        with patch(
            "app.api.routes.events.search_events_by_city_across_sources",
            new=AsyncMock(side_effect=EventAggregationError("provider failed")),
        ):
            response = self.client.get("/api/events/search", params={"city": "London"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


if __name__ == "__main__":
    unittest.main()
