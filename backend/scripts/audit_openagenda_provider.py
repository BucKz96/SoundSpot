import argparse
import asyncio
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
import sys

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.schemas.event import EventResponse  # noqa: E402
from app.utils.openagenda_event_classifier import (  # noqa: E402
    classify_openagenda_event,
)

OPENAGENDA_BASE_URL = "https://api.openagenda.com/v2"

DEFAULT_MUSIC_TERMS = [
    "concert",
    "musique",
    "festival",
    "jazz",
    "rock",
    "rap",
    "electro",
    "techno",
    "opera",
    "club",
    "live",
]

DEFAULT_AGENDA_SEARCH_TERMS = [
    "concert",
    "musique",
    "festival",
    "jazz",
    "rock",
    "rap",
    "electro",
    "techno",
    "opera",
]

DEFAULT_CITIES = [
    "Paris",
    "Lyon",
    "Marseille",
    "Lille",
    "Nantes",
    "Bordeaux",
    "Bruxelles",
    "Geneve",
]

def _auth_headers() -> dict[str, str]:
    api_key = settings.openagenda_api_key.strip()
    if not api_key:
        raise ValueError("OpenAgenda API key is not configured. Set OPENAGENDA_API_KEY.")

    return {"key": api_key}


def _ratio(value: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return value / total


def _text(value: object, preferred_language: str = "fr") -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        preferred = value.get(preferred_language)
        if isinstance(preferred, str) and preferred.strip():
            return preferred.strip()
        for item in value.values():
            if isinstance(item, str) and item.strip():
                return item.strip()
    return ""


def _safe_float(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _has_coordinate(event: dict) -> bool:
    location = event.get("location") or {}
    latitude = _safe_float(location.get("latitude"))
    longitude = _safe_float(location.get("longitude"))

    return latitude != 0 and longitude != 0


def _has_location(event: dict) -> bool:
    location = event.get("location") or {}
    return bool(location.get("name") or location.get("city") or location.get("address"))


def _registration_url(event: dict) -> str:
    for item in event.get("registration") or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "link":
            continue
        value = item.get("value")
        if isinstance(value, str) and value.strip():
            return value.strip()

    for item in event.get("links") or []:
        if isinstance(item, dict) and isinstance(item.get("link"), str):
            return item["link"].strip()

    return ""


def _event_url(event: dict, agenda: dict) -> str:
    for key in ("canonicalUrl", "url", "publicUrl"):
        value = event.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    agenda_slug = agenda.get("slug")
    event_slug = event.get("slug")
    if agenda_slug and event_slug:
        return f"https://openagenda.com/{agenda_slug}/events/{event_slug}"

    return _registration_url(event)


def _first_timing(event: dict) -> tuple[str, str]:
    timings = event.get("timings") or []
    if not timings:
        return "", ""

    begin = timings[0].get("begin") if isinstance(timings[0], dict) else ""
    if not isinstance(begin, str) or not begin:
        return "", ""

    try:
        parsed = datetime.fromisoformat(begin.replace("Z", "+00:00"))
    except ValueError:
        return begin[:10], begin[11:19] if len(begin) >= 19 else ""

    return parsed.date().isoformat(), parsed.time().isoformat(timespec="seconds")


def _field_names(events: list[dict]) -> list[str]:
    fields = set()
    for event in events:
        fields.update(event.keys())
        for prefix in ("location", "image"):
            value = event.get(prefix)
            if isinstance(value, dict):
                fields.update(f"{prefix}.{key}" for key in value.keys())
    return sorted(fields)


def _is_probably_music_event(event: dict) -> bool:
    return classify_openagenda_event(event).is_music_event


def _normalize_openagenda_event(event: dict, agenda: dict) -> EventResponse:
    location = event.get("location") or {}
    date, time = _first_timing(event)
    title = _text(event.get("title"))
    venue = location.get("name") or location.get("address") or "TBA"
    latitude = _safe_float(location.get("latitude"))
    longitude = _safe_float(location.get("longitude"))

    return EventResponse(
        id=str(event.get("uid") or ""),
        name=title or "OpenAgenda event",
        artist=title or "Various artists",
        city=location.get("city") or location.get("adminLevel4") or "",
        country=location.get("countryCode") or location.get("country") or "",
        venue=venue,
        date=date,
        time=time,
        latitude=latitude,
        longitude=longitude,
        ticket_url=_event_url(event, agenda),
        is_location_approximate=False,
        source="openagenda",
        genres=classify_openagenda_event(event).genres,
    )


async def _get_json(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, object],
) -> dict:
    response = await client.get(
        f"{OPENAGENDA_BASE_URL}{path}",
        params=params,
        headers=_auth_headers(),
    )
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


async def discover_agendas(
    client: httpx.AsyncClient,
    terms: list[str],
    max_agendas: int,
    max_agendas_per_term: int,
) -> list[dict]:
    discovered = {}

    for term in terms:
        data = await _get_json(
            client,
            "/agendas",
            {
                "search": term,
                "size": max_agendas_per_term,
                "sort": "recentlyAddedEvents.desc",
                "includeFields[]": ["uid", "title", "slug", "description", "official"],
            },
        )

        for agenda in data.get("agendas") or []:
            if not isinstance(agenda, dict):
                continue
            agenda_uid = str(agenda.get("uid") or "")
            if agenda_uid:
                discovered[agenda_uid] = agenda
            if len(discovered) >= max_agendas:
                return list(discovered.values())

    return list(discovered.values())


async def read_agenda(
    client: httpx.AsyncClient,
    agenda_uid: str,
) -> dict:
    data = await _get_json(
        client,
        f"/agendas/{agenda_uid}",
        {"includeFields[]": ["uid", "title", "slug", "description", "official"]},
    )
    return data if data else {"uid": agenda_uid}


async def fetch_events(
    client: httpx.AsyncClient,
    agenda_uid: str,
    search: str,
    city: str,
    size: int,
) -> list[dict]:
    params: dict[str, object] = {
        "relative[]": ["current", "upcoming"],
        "size": size,
        "search": search,
        "includeFields[]": [
            "uid",
            "slug",
            "title",
            "description",
            "longDescription",
            "keywords",
            "timings",
            "location",
            "registration",
            "links",
            "image",
            "status",
            "state",
        ],
    }

    if city:
        params["location.adminLevel4"] = city

    data = await _get_json(client, f"/agendas/{agenda_uid}/events", params)
    return [event for event in data.get("events") or [] if isinstance(event, dict)]


def score_agenda(
    agenda: dict,
    events: list[dict],
    music_query_events: list[dict],
) -> dict:
    classifications = [classify_openagenda_event(event) for event in events]
    music_events = [
        event
        for event, classification in zip(events, classifications)
        if classification.is_music_event
    ]
    genre_counts = Counter(
        genre
        for classification in classifications
        for genre in classification.genres
    )
    country_counts = Counter(
        (event.get("location") or {}).get("countryCode") for event in events
    )
    city_counts = Counter((event.get("location") or {}).get("city") for event in events)
    coordinate_count = sum(1 for event in events if _has_coordinate(event))
    location_count = sum(1 for event in events if _has_location(event))
    url_count = sum(1 for event in events if _event_url(event, agenda))
    total_events = len(events)
    music_query_hit_count = len(music_query_events)
    music_ratio = _ratio(len(music_events), total_events)
    coordinates_ratio = _ratio(coordinate_count, total_events)
    url_ratio = _ratio(url_count, total_events)
    location_ratio = _ratio(location_count, total_events)

    if (
        total_events >= 5
        and music_ratio >= 0.7
        and coordinates_ratio >= 0.5
        and url_ratio >= 0.5
        and location_ratio >= 0.7
    ):
        recommendation = "strong fit"
    elif (
        total_events >= 3
        and music_ratio >= 0.35
        and coordinates_ratio >= 0.35
        and url_ratio >= 0.35
        and location_ratio >= 0.5
    ):
        recommendation = "possible fit"
    else:
        recommendation = "too noisy"

    reasons = []
    if music_ratio >= 0.7:
        reasons.append("high music ratio")
    elif music_ratio >= 0.35:
        reasons.append("partial music relevance")
    else:
        reasons.append("low music ratio")

    reasons.append("coordinates usable" if coordinates_ratio >= 0.5 else "weak geolocation")
    reasons.append("URLs usable" if url_ratio >= 0.5 else "weak URL coverage")
    reasons.append("locations usable" if location_ratio >= 0.7 else "weak location coverage")

    return {
        "agenda": agenda,
        "events": events,
        "total_events": total_events,
        "music_count": len(music_events),
        "coordinate_count": coordinate_count,
        "location_count": location_count,
        "url_count": url_count,
        "music_query_hit_count": music_query_hit_count,
        "genre_counts": genre_counts.most_common(),
        "music_ratio": music_ratio,
        "coordinates_ratio": coordinates_ratio,
        "url_ratio": url_ratio,
        "location_ratio": location_ratio,
        "countries": country_counts.most_common(12),
        "cities": city_counts.most_common(12),
        "fields": _field_names(events),
        "recommendation": recommendation,
        "reason": ", ".join(reasons),
    }


def _score_sort_key(score: dict) -> tuple[int, float, float, float, int]:
    recommendation_rank = {
        "strong fit": 2,
        "possible fit": 1,
        "too noisy": 0,
    }

    return (
        recommendation_rank.get(score["recommendation"], 0),
        score["music_ratio"],
        score["coordinates_ratio"],
        score["url_ratio"],
        score["total_events"],
    )


def print_ranking(scores: list[dict]) -> None:
    print("\n# Agenda fit ranking")
    for score in sorted(scores, key=_score_sort_key, reverse=True):
        agenda = score["agenda"]
        print(
            "agenda:",
            agenda.get("uid"),
            "| slug:",
            agenda.get("slug") or "",
            "| title:",
            _text(agenda.get("title")),
        )
        print(
            "  total:",
            score["total_events"],
            "| music_ratio:",
            f"{score['music_ratio']:.2f}",
            "| coordinates_ratio:",
            f"{score['coordinates_ratio']:.2f}",
            "| url_ratio:",
            f"{score['url_ratio']:.2f}",
            "| music_query_hits:",
            score["music_query_hit_count"],
            "| recommendation:",
            score["recommendation"],
        )
        print("  countries:", score["countries"])
        print("  cities:", score["cities"])
        print("  genres:", score["genre_counts"])
        print("  reason:", score["reason"])


def print_summary(score: dict, examples: int) -> None:
    agenda = score["agenda"]
    events = score["events"]

    print("\n## Agenda", agenda.get("uid"), "-", _text(agenda.get("title")))
    print("slug:", agenda.get("slug") or "")
    print("events:", score["total_events"])
    print("with_coordinates:", score["coordinate_count"])
    print("with_location:", score["location_count"])
    print("with_event_or_registration_url:", score["url_count"])
    print("probably_music:", score["music_count"])
    print("genres:", score["genre_counts"])
    print("music_query_hits:", score["music_query_hit_count"])
    print("music_ratio:", f"{score['music_ratio']:.2f}")
    print("coordinates_ratio:", f"{score['coordinates_ratio']:.2f}")
    print("url_ratio:", f"{score['url_ratio']:.2f}")
    print("recommendation:", score["recommendation"])
    print("reason:", score["reason"])
    print("countries:", score["countries"])
    print("cities:", score["cities"])
    print("fields:", ", ".join(score["fields"]) if events else "none")

    for event in events[:examples]:
        normalized = _normalize_openagenda_event(event, agenda)
        classification = classify_openagenda_event(event)
        print(
            "  example:",
            normalized.date,
            "|",
            normalized.city,
            "|",
            normalized.country,
            "|",
            normalized.venue,
            "|",
            "is_music_event:",
            classification.is_music_event,
            "|",
            "genres:",
            classification.genres,
            "|",
            "signals:",
            classification.signals,
            "|",
            "exclusions:",
            classification.exclusion_signals,
        )
        print(
            "  normalizable:",
            json.dumps(
                normalized.model_dump(),
                ensure_ascii=False,
                sort_keys=True,
            ),
        )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-agendas", type=int, default=20)
    parser.add_argument("--max-agendas-per-term", type=int, default=5)
    parser.add_argument("--size", type=int, default=25)
    parser.add_argument("--baseline-size", type=int, default=50)
    parser.add_argument("--examples", type=int, default=3)
    parser.add_argument("--terms", nargs="*", default=DEFAULT_MUSIC_TERMS)
    parser.add_argument("--agenda-terms", nargs="*", default=DEFAULT_AGENDA_SEARCH_TERMS)
    parser.add_argument("--cities", nargs="*", default=DEFAULT_CITIES)
    args = parser.parse_args()

    async with httpx.AsyncClient(timeout=30.0) as client:
        agenda_uids = settings.openagenda_seed_agenda_uids
        if agenda_uids:
            agendas = [await read_agenda(client, agenda_uid) for agenda_uid in agenda_uids]
        else:
            agendas = await discover_agendas(
                client,
                args.agenda_terms,
                args.max_agendas,
                args.max_agendas_per_term,
            )

        print("agendas_tested:", len(agendas))
        print("agenda_terms:", args.agenda_terms)
        print("terms:", args.terms)
        print("cities:", args.cities)

        scores = []
        for agenda in agendas:
            agenda_uid = str(agenda.get("uid") or "")
            if not agenda_uid:
                continue

            baseline_events_by_uid = {}
            for event in await fetch_events(client, agenda_uid, "", "", args.baseline_size):
                baseline_events_by_uid[str(event.get("uid") or id(event))] = event

            music_query_events_by_uid = {}
            for term in args.terms:
                for event in await fetch_events(client, agenda_uid, term, "", args.size):
                    music_query_events_by_uid[str(event.get("uid") or id(event))] = event

            for city in args.cities:
                for event in await fetch_events(
                    client,
                    agenda_uid,
                    "concert musique festival",
                    city,
                    min(args.size, 10),
                ):
                    music_query_events_by_uid[str(event.get("uid") or id(event))] = event

            score_events = list(baseline_events_by_uid.values())
            if not score_events:
                score_events = list(music_query_events_by_uid.values())

            scores.append(
                score_agenda(
                    agenda,
                    score_events,
                    list(music_query_events_by_uid.values()),
                )
            )

        print_ranking(scores)

        for score in sorted(scores, key=_score_sort_key, reverse=True):
            print_summary(score, args.examples)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except ValueError as exc:
        print(f"error: {exc}")
        raise SystemExit(1) from exc
    except httpx.HTTPStatusError as exc:
        print(f"error: OpenAgenda API error (HTTP {exc.response.status_code}).")
        raise SystemExit(1) from exc
    except httpx.RequestError:
        print("error: Could not reach OpenAgenda API.")
        raise SystemExit(1)
