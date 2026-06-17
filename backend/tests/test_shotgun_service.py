import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.shotgun_service import (  # noqa: E402
    _extract_shotgun_image_url,
    _shotgun_event_to_response,
)


def shotgun_raw_event(**overrides):
    event = {
        "id": "shotgun-event-1",
        "name": "Shotgun Test Night",
        "startTime": "2026-07-04T22:30:00+02:00",
        "url": "https://shotgun.live/events/test-night",
        "geolocation": {
            "city": "Paris",
            "country": "France",
            "placeName": "Rex Club",
            "lat": 48.866,
            "lng": 2.347,
        },
        "eventArtists": [{"name": "Test Artist"}],
    }
    event.update(overrides)
    return event


class ShotgunImageMappingTests(unittest.TestCase):
    def test_extracts_direct_snake_case_image_url(self) -> None:
        raw_event = shotgun_raw_event(
            cover_url="https://cdn.shotgun.test/direct-cover.jpg",
        )

        self.assertEqual(
            _extract_shotgun_image_url(raw_event),
            "https://cdn.shotgun.test/direct-cover.jpg",
        )

    def test_extracts_nested_image_url(self) -> None:
        raw_event = shotgun_raw_event(
            visuals=[
                {"small": "https://cdn.shotgun.test/small.jpg"},
                {
                    "image": {
                        "url": "https://cdn.shotgun.test/nested-large.jpg",
                    },
                },
            ],
        )

        self.assertEqual(
            _extract_shotgun_image_url(raw_event),
            "https://cdn.shotgun.test/nested-large.jpg",
        )

    def test_no_image_returns_none(self) -> None:
        self.assertIsNone(_extract_shotgun_image_url(shotgun_raw_event()))

    def test_event_response_maps_shotgun_image_url(self) -> None:
        event = _shotgun_event_to_response(
            shotgun_raw_event(
                poster_url="https://cdn.shotgun.test/poster.jpg",
            ),
        )

        self.assertEqual(event.image_url, "https://cdn.shotgun.test/poster.jpg")
        self.assertEqual(event.source, "shotgun")
        self.assertEqual(event.city, "Paris")


if __name__ == "__main__":
    unittest.main()
