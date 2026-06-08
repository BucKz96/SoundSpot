import argparse
import asyncio
import calendar
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.geocoding_service import encode_geohash, geocode_city  # noqa: E402
from app.services.ticketmaster_service import (  # noqa: E402
    TICKETMASTER_EVENTS_URL,
    TICKETMASTER_PAGE_SIZE,
    _dedupe_events,
    _event_matches_city_keyword,
    _finalize_events,
    _get_ticketmaster_max_events,
    _is_valid_coordinate,
    _ticketmaster_event_to_response,
)

DEFAULT_CITIES = ("Paris", "Lyon", "Marseille")
DEFAULT_ARTISTS = ("Coldplay", "Metallica", "Bad Bunny", "Justice", "Bruno Mars")
COUNTRY_CODE = "FR"
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_EXAMPLES = 5


@dataclass(frozen=True)
class AuditStrategy:
    name: str
    params: dict[str, Any]


@dataclass(frozen=True)
class PageAudit:
    request_name: str
    page_number: int
    raw_count: int
    response_number: int | None
    total_pages: int | None
    total_elements: int | None


@dataclass
class StrategyAudit:
    scope: str
    strategy: str
    params: Any
    page_size: int
    pages: list[PageAudit]
    raw_events: list[dict[str, Any]]
    normalized_events: list[Any]
    rejected_events: list[dict[str, Any]]
    deduped_events: list[Any]
    exact_provider_coordinate_count: int
    fallback_coordinate_count: int
    not_mappable_events: list[Any]
    top_countries: list[tuple[str, int]]
    top_returned_cities: list[tuple[str, int]]
    top_venues: list[tuple[str, int]]
    event_examples: list[dict[str, str]]
    without_exact_coordinate_examples: list[dict[str, str]]
    rejected_examples: list[dict[str, str]]
    not_mappable_examples: list[dict[str, str]]

    @property
    def total_pages(self) -> int | None:
        values = [page.total_pages for page in self.pages if page.total_pages is not None]
        return max(values) if values else None

    @property
    def total_elements(self) -> int | None:
        values = [
            page.total_elements
            for page in self.pages
            if page.total_elements is not None
        ]
        return max(values) if values else None

    @property
    def raw_count(self) -> int:
        return len(self.raw_events)

    @property
    def french_raw_count(self) -> int:
        return sum(1 for raw in self.raw_events if _raw_country(raw) == COUNTRY_CODE)

    @property
    def normalized_count(self) -> int:
        return len(self.normalized_events)

    @property
    def with_display_coordinates_count(self) -> int:
        return sum(
            1
            for event in self.normalized_events
            if _is_valid_coordinate(event.latitude, event.longitude)
        )

    @property
    def without_any_coordinates_count(self) -> int:
        return len(self.not_mappable_events)

    @property
    def rejected_count(self) -> int:
        return len(self.rejected_events)

    @property
    def deduped_count(self) -> int:
        return len(self.deduped_events)

    @property
    def lost_after_deduplication(self) -> int:
        return self.normalized_count - self.deduped_count


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _build_date_params(date_mode: str, months_ahead: int) -> dict[str, str]:
    if date_mode == "none":
        return {}

    today = datetime.now(UTC).date()
    params = {"startDateTime": f"{today.isoformat()}T00:00:00Z"}
    if date_mode == "range":
        end_date = _add_months(today, months_ahead)
        params["endDateTime"] = f"{end_date.isoformat()}T23:59:59Z"
    return params


def _embedded_venue(raw: dict[str, Any]) -> dict[str, Any]:
    embedded = raw.get("_embedded") or {}
    venues = embedded.get("venues") or []
    if venues and isinstance(venues[0], dict):
        return venues[0]
    return {}


def _raw_city(raw: dict[str, Any]) -> str:
    city = _embedded_venue(raw).get("city") or {}
    return str(city.get("name") or "") if isinstance(city, dict) else ""


def _raw_country(raw: dict[str, Any]) -> str:
    country = _embedded_venue(raw).get("country") or {}
    if not isinstance(country, dict):
        return ""
    return str(country.get("countryCode") or country.get("name") or "")


def _raw_venue(raw: dict[str, Any]) -> str:
    return str(_embedded_venue(raw).get("name") or "TBA")


def _raw_location(raw: dict[str, Any]) -> tuple[float, float]:
    location = _embedded_venue(raw).get("location") or {}
    try:
        return float(location.get("latitude") or 0), float(location.get("longitude") or 0)
    except (TypeError, ValueError):
        return 0.0, 0.0


def _raw_has_exact_coordinates(raw: dict[str, Any]) -> bool:
    return _is_valid_coordinate(*_raw_location(raw))


def _event_example(raw: dict[str, Any], reason: str = "") -> dict[str, str]:
    start = (raw.get("dates") or {}).get("start") or {}
    example = {
        "id": str(raw.get("id") or ""),
        "name": str(raw.get("name") or "Event"),
        "country": _raw_country(raw),
        "city": _raw_city(raw),
        "venue": _raw_venue(raw),
        "date": str(start.get("localDate") or ""),
    }
    if reason:
        example["reason"] = reason
    return example


def _normalized_example(event: Any, reason: str = "") -> dict[str, str]:
    example = {
        "id": str(event.id),
        "name": str(event.name),
        "country": str(event.country),
        "city": str(event.city),
        "venue": str(event.venue),
        "date": str(event.date),
    }
    if reason:
        example["reason"] = reason
    return example


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if key.lower() == "apikey" else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _build_strategies(
    city: str,
    latitude: float,
    longitude: float,
    radius: int,
    date_params: dict[str, str],
) -> list[AuditStrategy]:
    common = {"sort": "date,asc", **date_params}
    latlong = f"{latitude},{longitude}"
    geo_point = encode_geohash(latitude, longitude)
    return [
        AuditStrategy(
            "A_city_country_classification_music",
            {
                "city": city,
                "countryCode": COUNTRY_CODE,
                "classificationName": "Music",
                **common,
            },
        ),
        AuditStrategy(
            "B_city_country_segment_music",
            {
                "city": city,
                "countryCode": COUNTRY_CODE,
                "segmentName": "Music",
                **common,
            },
        ),
        AuditStrategy(
            "C_city_country_all",
            {"city": city, "countryCode": COUNTRY_CODE, **common},
        ),
        AuditStrategy("D_city_all_no_country", {"city": city, **common}),
        AuditStrategy(
            "E_keyword_country",
            {"keyword": city, "countryCode": COUNTRY_CODE, **common},
        ),
        AuditStrategy("F_keyword_no_country", {"keyword": city, **common}),
        AuditStrategy(
            "G_latlong_country_music",
            {
                "latlong": latlong,
                "radius": radius,
                "unit": "km",
                "countryCode": COUNTRY_CODE,
                "classificationName": "Music",
                **common,
            },
        ),
        AuditStrategy(
            "H_latlong_country_all",
            {
                "latlong": latlong,
                "radius": radius,
                "unit": "km",
                "countryCode": COUNTRY_CODE,
                **common,
            },
        ),
        AuditStrategy(
            "I_latlong_all_no_country",
            {"latlong": latlong, "radius": radius, "unit": "km", **common},
        ),
        AuditStrategy(
            "J_geopoint_country_music",
            {
                "geoPoint": geo_point,
                "radius": radius,
                "unit": "km",
                "countryCode": COUNTRY_CODE,
                "classificationName": "Music",
                **common,
            },
        ),
        AuditStrategy(
            "K_geopoint_country_all",
            {
                "geoPoint": geo_point,
                "radius": radius,
                "unit": "km",
                "countryCode": COUNTRY_CODE,
                **common,
            },
        ),
        AuditStrategy(
            "L_geopoint_all_no_country",
            {"geoPoint": geo_point, "radius": radius, "unit": "km", **common},
        ),
    ]


def _build_artist_strategy(
    artist: str,
    date_params: dict[str, str],
) -> AuditStrategy:
    return AuditStrategy(
        "artist_keyword_music",
        {
            "keyword": artist,
            "classificationName": "Music",
            "sort": "date,asc",
            **date_params,
        },
    )


async def _fetch_raw_events(
    client: httpx.AsyncClient,
    params: dict[str, Any],
    size: int,
    max_pages: int,
    request_name: str,
    max_events: int | None = None,
) -> tuple[list[dict[str, Any]], list[PageAudit]]:
    events: list[dict[str, Any]] = []
    pages: list[PageAudit] = []

    for page_number in range(max_pages):
        response = await client.get(
            TICKETMASTER_EVENTS_URL,
            params={**params, "size": size, "page": page_number},
        )
        response.raise_for_status()
        data = response.json()
        page_info = data.get("page") or {}
        page_events = (data.get("_embedded") or {}).get("events") or []
        if not isinstance(page_events, list):
            page_events = []

        total_pages = page_info.get("totalPages")
        total_elements = page_info.get("totalElements")
        response_number = page_info.get("number")
        pages.append(
            PageAudit(
                request_name=request_name,
                page_number=page_number,
                raw_count=len(page_events),
                response_number=response_number
                if isinstance(response_number, int)
                else None,
                total_pages=total_pages if isinstance(total_pages, int) else None,
                total_elements=total_elements
                if isinstance(total_elements, int)
                else None,
            )
        )
        events.extend(event for event in page_events if isinstance(event, dict))

        if max_events is not None and len(events) >= max_events:
            events = events[:max_events]
            break
        if not page_events:
            break
        if isinstance(total_pages, int) and page_number >= total_pages - 1:
            break

    return events, pages


async def _normalize_raw_events(
    raw_events: list[dict[str, Any]],
) -> tuple[list[tuple[dict[str, Any], Any]], list[dict[str, Any]]]:
    normalized_pairs = []
    rejected_events = []
    for raw in raw_events:
        try:
            normalized_pairs.append((raw, await _ticketmaster_event_to_response(raw)))
        except (TypeError, ValueError, KeyError) as exc:
            rejected_events.append({"raw": raw, "reason": str(exc)})
    return normalized_pairs, rejected_events


def _create_audit(
    scope: str,
    strategy: str,
    params: Any,
    page_size: int,
    pages: list[PageAudit],
    raw_events: list[dict[str, Any]],
    normalized_pairs: list[tuple[dict[str, Any], Any]],
    rejected_events: list[dict[str, Any]],
    deduped_events: list[Any] | None = None,
) -> StrategyAudit:
    normalized_events = [event for _, event in normalized_pairs]
    final_events = (
        deduped_events
        if deduped_events is not None
        else _dedupe_events(normalized_events)
    )
    exact_provider_coordinate_count = sum(
        1 for raw, _ in normalized_pairs if _raw_has_exact_coordinates(raw)
    )
    fallback_coordinate_count = sum(
        1
        for raw, event in normalized_pairs
        if not _raw_has_exact_coordinates(raw)
        and _is_valid_coordinate(event.latitude, event.longitude)
    )
    not_mappable_events = [
        event
        for event in normalized_events
        if not _is_valid_coordinate(event.latitude, event.longitude)
    ]
    rejected_examples = [
        _event_example(item["raw"], item["reason"]) for item in rejected_events
    ][:MAX_EXAMPLES]

    return StrategyAudit(
        scope=scope,
        strategy=strategy,
        params=_redact(params),
        page_size=page_size,
        pages=pages,
        raw_events=raw_events,
        normalized_events=normalized_events,
        rejected_events=rejected_events,
        deduped_events=final_events,
        exact_provider_coordinate_count=exact_provider_coordinate_count,
        fallback_coordinate_count=fallback_coordinate_count,
        not_mappable_events=not_mappable_events,
        top_countries=Counter(
            _raw_country(raw) or "unknown" for raw in raw_events
        ).most_common(10),
        top_returned_cities=Counter(
            _raw_city(raw) or "unknown" for raw in raw_events
        ).most_common(10),
        top_venues=Counter(
            _raw_venue(raw) or "unknown" for raw in raw_events
        ).most_common(10),
        event_examples=[_event_example(raw) for raw in raw_events[:MAX_EXAMPLES]],
        without_exact_coordinate_examples=[
            _event_example(
                raw,
                "displayed with fallback coordinates"
                if _is_valid_coordinate(event.latitude, event.longitude)
                else "not mappable after normalization",
            )
            for raw, event in normalized_pairs
            if not _raw_has_exact_coordinates(raw)
        ][:MAX_EXAMPLES],
        rejected_examples=rejected_examples,
        not_mappable_examples=[
            _normalized_example(event, "no provider or fallback coordinates")
            for event in not_mappable_events[:MAX_EXAMPLES]
        ],
    )


async def _audit_strategy(
    client: httpx.AsyncClient,
    scope: str,
    strategy: AuditStrategy,
    api_key: str,
    size: int,
    max_pages: int,
) -> StrategyAudit:
    params = {"apikey": api_key, **strategy.params}
    raw_events, pages = await _fetch_raw_events(
        client,
        params,
        size,
        max_pages,
        strategy.name,
    )
    normalized_pairs, rejected_events = await _normalize_raw_events(raw_events)
    return _create_audit(
        scope,
        strategy.name,
        params,
        size,
        pages,
        raw_events,
        normalized_pairs,
        rejected_events,
    )


async def _audit_production_flow(
    client: httpx.AsyncClient,
    city: str,
    api_key: str,
) -> StrategyAudit:
    coordinates = await geocode_city(city)
    production_max_events = _get_ticketmaster_max_events()
    production_page_size = min(TICKETMASTER_PAGE_SIZE, production_max_events)
    production_max_pages = max(
        1,
        (production_max_events + production_page_size - 1)
        // production_page_size,
    )
    production_radius = settings.city_search_radius_km
    all_raw_events: list[dict[str, Any]] = []
    all_pages: list[PageAudit] = []
    flow_params: dict[str, Any] = {
        "production_max_events": production_max_events,
        "production_page_size": production_page_size,
        "production_max_pages": production_max_pages,
        "production_radius_km": production_radius,
        "date_filter": "none",
        "steps": [],
    }

    if coordinates:
        radius_params = {
            "apikey": api_key,
            "classificationName": "Music",
            "geoPoint": encode_geohash(coordinates.latitude, coordinates.longitude),
            "radius": production_radius,
            "unit": "km",
            "sort": "distance,asc",
        }
        flow_params["steps"].append({"radius": radius_params})
        radius_raw, radius_pages = await _fetch_raw_events(
            client,
            radius_params,
            production_page_size,
            production_max_pages,
            "prod_radius_geopoint",
            production_max_events,
        )
        all_raw_events.extend(radius_raw)
        all_pages.extend(radius_pages)
        radius_pairs, radius_rejected = await _normalize_raw_events(radius_raw)
        radius_events = [event for _, event in radius_pairs]
        if radius_events:
            final_events = _finalize_events(radius_events)
            return _create_audit(
                city,
                "M_exact_production_flow",
                flow_params,
                production_page_size,
                all_pages,
                all_raw_events,
                radius_pairs,
                radius_rejected,
                final_events,
            )

    city_params = {
        "apikey": api_key,
        "classificationName": "Music",
        "city": city,
    }
    flow_params["steps"].append({"fallback_city": city_params})
    city_raw, city_pages = await _fetch_raw_events(
        client,
        city_params,
        production_page_size,
        production_max_pages,
        "prod_fallback_city",
        production_max_events,
    )
    all_raw_events.extend(city_raw)
    all_pages.extend(city_pages)
    city_pairs, city_rejected = await _normalize_raw_events(city_raw)

    keyword_pairs: list[tuple[dict[str, Any], Any]] = []
    keyword_rejected: list[dict[str, Any]] = []
    if coordinates and coordinates.country_code:
        keyword_params = {
            "apikey": api_key,
            "classificationName": "Music",
            "keyword": city,
            "countryCode": coordinates.country_code,
        }
        flow_params["steps"].append(
            {
                "fallback_keyword": keyword_params,
                "post_filter": "_event_matches_city_keyword",
            }
        )
        keyword_raw, keyword_pages = await _fetch_raw_events(
            client,
            keyword_params,
            production_page_size,
            production_max_pages,
            "prod_fallback_keyword",
            production_max_events,
        )
        all_raw_events.extend(keyword_raw)
        all_pages.extend(keyword_pages)
        all_keyword_pairs, keyword_rejected = await _normalize_raw_events(keyword_raw)
        keyword_pairs = [
            pair
            for pair in all_keyword_pairs
            if _event_matches_city_keyword(pair[1], city)
        ]

    selected_pairs = [*city_pairs, *keyword_pairs]
    selected_events = [event for _, event in selected_pairs]
    final_events = _finalize_events(selected_events)
    return _create_audit(
        city,
        "M_exact_production_flow",
        flow_params,
        production_page_size,
        all_pages,
        all_raw_events,
        selected_pairs,
        [*city_rejected, *keyword_rejected],
        final_events,
    )


def _format_pairs(values: list[tuple[str, int]]) -> str:
    if not values:
        return "none"
    return ", ".join(f"{name or 'unknown'} ({count})" for name, count in values)


def _format_examples(examples: list[dict[str, str]]) -> list[str]:
    if not examples:
        return ["- none"]
    lines = []
    for example in examples:
        reason = f" | reason={example['reason']}" if example.get("reason") else ""
        lines.append(
            "- "
            f"{example.get('name', '')} | id={example.get('id', '')} | "
            f"country={example.get('country', '')} | "
            f"city={example.get('city', '')} | "
            f"venue={example.get('venue', '')} | "
            f"date={example.get('date', '')}{reason}"
        )
    return lines


def _page_summary(result: StrategyAudit) -> str:
    if not result.pages:
        return "none"
    return ", ".join(
        f"{page.request_name}:page={page.page_number}"
        f"/number={page.response_number}/events={page.raw_count}"
        for page in result.pages
    )


def _strategy_lines(result: StrategyAudit) -> list[str]:
    return [
        f"### Strategy: {result.strategy}",
        "",
        f"- params: `{result.params}`",
        f"- page_size: {result.page_size}",
        f"- pages_called: {_page_summary(result)}",
        f"- totalPages: {result.total_pages}",
        f"- totalElements: {result.total_elements}",
        f"- raw_events: {result.raw_count}",
        f"- normalized_events: {result.normalized_count}",
        f"- with_display_coordinates: {result.with_display_coordinates_count}",
        (
            "- with_exact_provider_coordinates: "
            f"{result.exact_provider_coordinate_count}"
        ),
        f"- with_fallback_coordinates: {result.fallback_coordinate_count}",
        f"- without_any_coordinates: {result.without_any_coordinates_count}",
        f"- rejected: {result.rejected_count}",
        f"- deduped_count: {result.deduped_count}",
        f"- lost_after_deduplication: {result.lost_after_deduplication}",
        f"- top_countries: {_format_pairs(result.top_countries)}",
        f"- top_returned_cities: {_format_pairs(result.top_returned_cities)}",
        f"- top_venues: {_format_pairs(result.top_venues)}",
        "",
        "#### Event examples",
        *_format_examples(result.event_examples),
        "",
        "#### examples_without_exact_coordinates",
        *_format_examples(result.without_exact_coordinate_examples),
        "",
        "#### examples_not_mappable",
        *_format_examples(result.not_mappable_examples),
        "",
        "#### examples_rejected",
        *_format_examples(result.rejected_examples),
        "",
    ]


def _delta(
    city_results: dict[str, StrategyAudit],
    left: str,
    right: str,
) -> tuple[int, int] | None:
    left_result = city_results.get(left)
    right_result = city_results.get(right)
    if not left_result or not right_result:
        return None
    return (
        right_result.raw_count - left_result.raw_count,
        right_result.with_display_coordinates_count
        - left_result.with_display_coordinates_count,
    )


def _best_strategy(city_results: dict[str, StrategyAudit]) -> StrategyAudit | None:
    alternatives = [
        result
        for name, result in city_results.items()
        if name != "M_exact_production_flow"
    ]
    candidates = alternatives or list(city_results.values())
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda result: (
            result.french_raw_count,
            -list(city_results).index(result.strategy),
        ),
    )


def _comparison_lines(city_results: dict[str, StrategyAudit]) -> list[str]:
    comparisons = [
        ("latlong vs geoPoint Music", "G_latlong_country_music", "J_geopoint_country_music"),
        ("latlong vs geoPoint all", "H_latlong_country_all", "K_geopoint_country_all"),
        ("city vs geoPoint Music", "A_city_country_classification_music", "J_geopoint_country_music"),
        ("city country vs no country", "C_city_country_all", "D_city_all_no_country"),
        ("keyword country vs no country", "E_keyword_country", "F_keyword_no_country"),
        ("geoPoint country vs no country", "K_geopoint_country_all", "L_geopoint_all_no_country"),
        ("city Music vs all", "A_city_country_classification_music", "C_city_country_all"),
        ("latlong Music vs all", "G_latlong_country_music", "H_latlong_country_all"),
        ("geoPoint Music vs all", "J_geopoint_country_music", "K_geopoint_country_all"),
    ]
    lines = []
    for label, left, right in comparisons:
        delta = _delta(city_results, left, right)
        if delta is not None:
            lines.append(
                f"- {label}: raw_delta={delta[0]}, display_coordinate_delta={delta[1]}"
            )
    return lines


def _pagination_summary(results: list[StrategyAudit]) -> str:
    truncated = [
        result
        for result in results
        if result.total_pages is not None and result.total_pages > len(result.pages)
    ]
    if not truncated:
        return "No audited strategy was truncated by max-pages."
    names = ", ".join(f"{result.scope}/{result.strategy}" for result in truncated)
    return f"Potential truncation detected for: {names}."


def _summary_lines(
    audits_by_city: dict[str, dict[str, StrategyAudit]],
    args: argparse.Namespace,
) -> list[str]:
    all_results = [
        result
        for city_results in audits_by_city.values()
        for result in city_results.values()
    ]
    lines = [
        "## Summary",
        "",
        (
            f"- Audit window: date_mode={args.date_mode}, "
            f"months_ahead={args.months_ahead}."
        ),
        f"- Pagination: {_pagination_summary(all_results)}",
        "- The exact production flow is reported separately as strategy M and uses no date filter.",
    ]
    for city, city_results in audits_by_city.items():
        best = _best_strategy(city_results)
        prod = city_results.get("M_exact_production_flow")
        if best:
            lines.append(
                f"- {city}: best alternative={best.strategy} "
                f"({best.raw_count} raw, "
                f"{best.french_raw_count} French, "
                f"{best.with_display_coordinates_count} displayable)."
            )
        if prod:
            lines.append(
                f"- {city}: exact prod flow={prod.raw_count} raw, "
                f"{prod.deduped_count} final."
            )
    lines.extend(
        [
            "- A 6-month versus 12-month conclusion requires two reports run with identical other options.",
            "",
        ]
    )
    return lines


def _final_recommendation_lines(
    audits_by_city: dict[str, dict[str, StrategyAudit]],
    args: argparse.Namespace,
) -> list[str]:
    city_music = []
    prod_results = []
    geopoint_wins = 0
    country_increases = 0
    country_french_increases = 0
    all_filter_increases = 0
    for city_results in audits_by_city.values():
        if result := city_results.get("A_city_country_classification_music"):
            city_music.append(result)
        if result := city_results.get("M_exact_production_flow"):
            prod_results.append(result)
        delta = _delta(
            city_results,
            "G_latlong_country_music",
            "J_geopoint_country_music",
        )
        if delta and delta[0] > 0:
            geopoint_wins += 1
        for left, right in (
            ("C_city_country_all", "D_city_all_no_country"),
            ("E_keyword_country", "F_keyword_no_country"),
            ("K_geopoint_country_all", "L_geopoint_all_no_country"),
        ):
            delta = _delta(city_results, left, right)
            if delta and delta[0] > 0:
                country_increases += 1
            left_result = city_results.get(left)
            right_result = city_results.get(right)
            if (
                left_result
                and right_result
                and right_result.french_raw_count > left_result.french_raw_count
            ):
                country_french_increases += 1
        for left, right in (
            ("A_city_country_classification_music", "C_city_country_all"),
            ("G_latlong_country_music", "H_latlong_country_all"),
            ("J_geopoint_country_music", "K_geopoint_country_all"),
        ):
            delta = _delta(city_results, left, right)
            if delta and delta[0] > 0:
                all_filter_increases += 1

    city_total = sum(result.raw_count for result in city_music)
    prod_total = sum(result.deduped_count for result in prod_results)
    all_results = [
        result
        for city_results in audits_by_city.values()
        for result in city_results.values()
    ]
    return [
        "## Final recommendation",
        "",
        (
            f"- Strict French city search returned {city_total} raw events across "
            f"{len(city_music)} cities."
        ),
        (
            f"- Exact production flow returned {prod_total} final events across "
            f"{len(prod_results)} cities."
        ),
        f"- geoPoint beat equivalent latlong Music searches in {geopoint_wins} cities.",
        (
            "- Removing countryCode increased comparable result counts in "
            f"{country_increases} comparisons."
        ),
        (
            "- Removing countryCode increased French result counts in "
            f"{country_french_increases} comparisons."
        ),
        (
            "- Removing the Music filter increased comparable result counts in "
            f"{all_filter_increases} comparisons."
        ),
        f"- Date mode tested for alternatives: {args.date_mode}.",
        f"- Pagination assessment: {_pagination_summary(all_results)}",
        (
            "- Backend changes should only be considered where an alternative "
            "consistently beats strategy M with relevant French events."
        ),
        (
            "- If strategy M is equal to or better than alternatives, no major "
            "Ticketmaster production change is justified by this audit."
        ),
        "",
    ]


def _build_markdown_report(
    audits_by_city: dict[str, dict[str, StrategyAudit]],
    artist_audits: dict[str, StrategyAudit],
    args: argparse.Namespace,
) -> str:
    lines = ["# Ticketmaster Independent Coverage Audit", ""]
    lines.extend(_summary_lines(audits_by_city, args))
    for city, city_results in audits_by_city.items():
        lines.extend([f"## {city}", ""])
        for result in city_results.values():
            lines.extend(_strategy_lines(result))
        lines.extend(["### Comparisons", "", *_comparison_lines(city_results), ""])

    if artist_audits:
        lines.extend(["## Artist tests", ""])
        for artist, result in artist_audits.items():
            lines.extend([f"### {artist}", ""])
            lines.extend(_strategy_lines(result)[2:])

    lines.extend(_final_recommendation_lines(audits_by_city, args))
    return "\n".join(lines).rstrip() + "\n"


def _print_terminal_summary(
    audits_by_city: dict[str, dict[str, StrategyAudit]],
    output_path: Path | None,
) -> None:
    print("# Ticketmaster Independent Coverage Audit")
    for city, city_results in audits_by_city.items():
        best = _best_strategy(city_results)
        prod = city_results.get("M_exact_production_flow")
        geo_delta = _delta(
            city_results,
            "G_latlong_country_music",
            "J_geopoint_country_music",
        )
        print(f"\n## {city}")
        if best:
            print(
                f"best_strategy: {best.strategy} | raw_events={best.raw_count} | "
                f"french_events={best.french_raw_count} | "
                f"display_coordinates={best.with_display_coordinates_count}"
            )
        if geo_delta:
            print(
                "geoPoint_vs_latlong: "
                f"raw_delta={geo_delta[0]} | display_delta={geo_delta[1]}"
            )
        if prod:
            print(
                f"prod_flow: raw_events={prod.raw_count} | "
                f"final_events={prod.deduped_count}"
            )
    if output_path:
        print(f"\nreport: {output_path}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Ticketmaster event coverage.")
    parser.add_argument("--cities", nargs="+", default=list(DEFAULT_CITIES))
    parser.add_argument("--size", type=int, default=50)
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--radius", type=int, default=50)
    parser.add_argument("--months-ahead", type=int, default=6)
    parser.add_argument(
        "--date-mode",
        choices=("range", "future", "none"),
        default="range",
        help="range=start and end dates, future=start only, none=no date filter",
    )
    parser.add_argument("--include-artists", action="store_true")
    parser.add_argument("--audit-artists", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--artists", nargs="+", default=list(DEFAULT_ARTISTS))
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def _validate_args(args: argparse.Namespace) -> None:
    args.cities = [city.strip() for city in args.cities if city.strip()]
    args.artists = [artist.strip() for artist in args.artists if artist.strip()]
    args.include_artists = args.include_artists or args.audit_artists
    if not args.cities:
        raise SystemExit("At least one city is required.")
    if args.size < 1 or args.size > 200:
        raise SystemExit("--size must be between 1 and 200.")
    if args.max_pages < 1 or args.max_pages > 20:
        raise SystemExit("--max-pages must be between 1 and 20.")
    if args.radius < 1 or args.radius > 500:
        raise SystemExit("--radius must be between 1 and 500.")
    if args.months_ahead < 1 or args.months_ahead > 24:
        raise SystemExit("--months-ahead must be between 1 and 24.")
    if args.include_artists and not args.artists:
        raise SystemExit("At least one artist is required with --include-artists.")


async def _run(args: argparse.Namespace) -> None:
    api_key = (settings.ticketmaster_api_key or "").strip()
    if not api_key:
        raise SystemExit(
            "Ticketmaster API key is not configured. Set TICKETMASTER_API_KEY "
            "in backend/.env or your environment."
        )

    date_params = _build_date_params(args.date_mode, args.months_ahead)
    audits_by_city: dict[str, dict[str, StrategyAudit]] = {}
    artist_audits: dict[str, StrategyAudit] = {}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        for city in args.cities:
            coordinates = await geocode_city(city, COUNTRY_CODE)
            if not coordinates:
                raise SystemExit(f"Could not geocode {city} in {COUNTRY_CODE}.")

            city_results: dict[str, StrategyAudit] = {}
            for strategy in _build_strategies(
                city,
                coordinates.latitude,
                coordinates.longitude,
                args.radius,
                date_params,
            ):
                try:
                    city_results[strategy.name] = await _audit_strategy(
                        client,
                        city,
                        strategy,
                        api_key,
                        args.size,
                        args.max_pages,
                    )
                except httpx.HTTPStatusError as exc:
                    raise SystemExit(
                        f"Ticketmaster API error for {city}/{strategy.name}: "
                        f"HTTP {exc.response.status_code}"
                    ) from exc
                except httpx.RequestError as exc:
                    raise SystemExit(
                        f"Could not reach Ticketmaster API for "
                        f"{city}/{strategy.name}: {exc}"
                    ) from exc

            try:
                city_results["M_exact_production_flow"] = (
                    await _audit_production_flow(client, city, api_key)
                )
            except httpx.HTTPStatusError as exc:
                raise SystemExit(
                    f"Ticketmaster API error for {city}/production flow: "
                    f"HTTP {exc.response.status_code}"
                ) from exc
            except httpx.RequestError as exc:
                raise SystemExit(
                    f"Could not reach Ticketmaster API for "
                    f"{city}/production flow: {exc}"
                ) from exc
            audits_by_city[city] = city_results

        if args.include_artists:
            for artist in args.artists:
                strategy = _build_artist_strategy(artist, date_params)
                try:
                    artist_audits[artist] = await _audit_strategy(
                        client,
                        artist,
                        strategy,
                        api_key,
                        args.size,
                        args.max_pages,
                    )
                except httpx.HTTPStatusError as exc:
                    raise SystemExit(
                        f"Ticketmaster API error for artist {artist}: "
                        f"HTTP {exc.response.status_code}"
                    ) from exc
                except httpx.RequestError as exc:
                    raise SystemExit(
                        f"Could not reach Ticketmaster API for artist {artist}: {exc}"
                    ) from exc

    output_path = args.output
    if output_path:
        if not output_path.is_absolute():
            output_path = (Path.cwd() / output_path).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            _build_markdown_report(audits_by_city, artist_audits, args),
            encoding="utf-8",
        )
    _print_terminal_summary(audits_by_city, output_path)


def main() -> None:
    args = _parse_args()
    _validate_args(args)
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
