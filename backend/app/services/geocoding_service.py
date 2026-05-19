from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass(frozen=True)
class CityCoordinates:
    latitude: float
    longitude: float
    country_code: str = ""


_CITY_CACHE: dict[str, CityCoordinates] = {}
_GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"


async def geocode_city(
    city: str,
    country_code: str | None = None,
) -> CityCoordinates | None:
    city_query = city.strip()
    if not city_query:
        return None

    country_query = (country_code or "").strip().lower()
    cache_key = f"{city_query.lower()}:{country_query}"
    if cache_key in _CITY_CACHE:
        return _CITY_CACHE[cache_key]

    params = {
        "city": city_query,
        "format": "jsonv2",
        "addressdetails": 1,
        "limit": 1,
    }

    if country_query:
        params["countrycodes"] = country_query

    headers = {"User-Agent": settings.geocoding_user_agent}

    try:
        async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
            response = await client.get(settings.geocoding_url, params=params)
            response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return None

    try:
        results = response.json()
    except ValueError:
        return None

    if not isinstance(results, list) or not results:
        return None

    first_result = results[0]

    try:
        address = first_result.get("address") or {}
        coordinates = CityCoordinates(
            latitude=float(first_result["lat"]),
            longitude=float(first_result["lon"]),
            country_code=str(address.get("country_code") or "").upper(),
        )
    except (KeyError, TypeError, ValueError):
        return None

    _CITY_CACHE[cache_key] = coordinates
    return coordinates


def encode_geohash(latitude: float, longitude: float, precision: int = 9) -> str:
    latitude_range = [-90.0, 90.0]
    longitude_range = [-180.0, 180.0]
    geohash = []
    bit = 0
    char_index = 0
    use_longitude = True

    while len(geohash) < precision:
        if use_longitude:
            midpoint = sum(longitude_range) / 2
            if longitude >= midpoint:
                char_index = (char_index << 1) + 1
                longitude_range[0] = midpoint
            else:
                char_index <<= 1
                longitude_range[1] = midpoint
        else:
            midpoint = sum(latitude_range) / 2
            if latitude >= midpoint:
                char_index = (char_index << 1) + 1
                latitude_range[0] = midpoint
            else:
                char_index <<= 1
                latitude_range[1] = midpoint

        use_longitude = not use_longitude

        if bit == 4:
            geohash.append(_GEOHASH_ALPHABET[char_index])
            bit = 0
            char_index = 0
        else:
            bit += 1

    return "".join(geohash)
