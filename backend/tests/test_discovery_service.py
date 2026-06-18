import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.event import EventResponse  # noqa: E402
from app.services import discovery_service  # noqa: E402
from app.services.ticketmaster_service import TicketmasterRateLimitError  # noqa: E402


def discovery_event(
    event_id: str = "shotgun:event-1",
    source: str = "shotgun",
) -> EventResponse:
    return EventResponse(
        id=event_id,
        name="Stable Discovery Event",
        artist="Various artists",
        city="Paris",
        country="France",
        venue="Rex Club",
        date="2099-07-04",
        time="22:00",
        latitude=48.866,
        longitude=2.347,
        ticket_url="https://example.com/event",
        source=source,
    )


def reset_discovery_cache() -> None:
    discovery_service._cached_events = []
    discovery_service._cache_expires_at = 0.0
    discovery_service._has_cached_response = False
    discovery_service._cache_ticketmaster_attempted = False
    discovery_service._cache_openagenda_attempted = False


class DiscoveryServiceStabilityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        reset_discovery_cache()

    def tearDown(self) -> None:
        reset_discovery_cache()

    async def test_ticketmaster_rate_limit_does_not_block_partial_discovery(self) -> None:
        event = discovery_event()

        with (
            patch(
                "app.services.discovery_service._get_shotgun_discovery_events",
                new=AsyncMock(return_value=[event]),
            ),
            patch(
                "app.services.discovery_service._get_ticketmaster_discovery_events",
                new=AsyncMock(
                    side_effect=TicketmasterRateLimitError(
                        "Ticketmaster rate limited; temporarily skipping provider."
                    ),
                ),
            ),
            patch(
                "app.services.discovery_service._get_openagenda_discovery_events",
                new=AsyncMock(return_value=[]),
            ),
        ):
            events = await discovery_service.get_discovery_events()

        self.assertEqual(events, [event])

    async def test_discovery_cache_prevents_repeated_provider_calls(self) -> None:
        event = discovery_event()

        shotgun_mock = AsyncMock(return_value=[event])
        ticketmaster_mock = AsyncMock(return_value=[])
        openagenda_mock = AsyncMock(return_value=[])

        with (
            patch(
                "app.services.discovery_service._get_shotgun_discovery_events",
                new=shotgun_mock,
            ),
            patch(
                "app.services.discovery_service._get_ticketmaster_discovery_events",
                new=ticketmaster_mock,
            ),
            patch(
                "app.services.discovery_service._get_openagenda_discovery_events",
                new=openagenda_mock,
            ),
        ):
            first_events = await discovery_service.get_discovery_events()
            second_events = await discovery_service.get_discovery_events()

        self.assertEqual(first_events, [event])
        self.assertEqual(second_events, [event])
        self.assertEqual(shotgun_mock.await_count, 1)
        self.assertEqual(ticketmaster_mock.await_count, 1)
        self.assertEqual(openagenda_mock.await_count, 1)


if __name__ == "__main__":
    unittest.main()
