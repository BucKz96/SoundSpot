CITY_ALIASES = {
    "londres": "London",
    "bruxelles": "Brussels",
    "milan": "Milan",
    "milano": "Milan",
    "rome": "Rome",
    "roma": "Rome",
    "new york": "New York",
}


def normalize_city_name(city: str) -> str:
    normalized_city = city.strip()
    alias_key = normalized_city.lower()

    return CITY_ALIASES.get(alias_key, normalized_city)
