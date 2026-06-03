from unicodedata import normalize

NORMALIZED_GENRES = (
    "techno",
    "house",
    "electronic",
    "rock",
    "rap",
    "pop",
    "festival",
    "club",
    "jazz",
    "classical",
    "metal",
    "latin",
    "funk",
)

GENRE_KEYWORDS = {
    "techno": (
        "techno",
        "hard techno",
        "melodic techno",
        "minimal techno",
        "acid techno",
    ),
    "house": (
        "house",
        "deep house",
        "tech house",
        "acid house",
        "afro house",
        "progressive house",
    ),
    "electronic": (
        "electronic",
        "electronica",
        "electro",
        "edm",
        "dance",
        "dance/electronic",
        "dance / electronic",
        "rave",
        "trance",
        "drum and bass",
        "drum & bass",
        "dnb",
        "bass music",
        "dubstep",
    ),
    "rock": (
        "rock",
        "alternative rock",
        "indie rock",
        "punk",
        "post-punk",
        "hard rock",
        "garage rock",
    ),
    "rap": (
        "rap",
        "hip-hop",
        "hip hop",
        "trap",
        "drill",
        "r&b",
        "rnb",
    ),
    "pop": (
        "pop",
        "k-pop",
        "synthpop",
        "indie pop",
        "electropop",
    ),
    "festival": (
        "festival",
        "fest",
        "open air",
    ),
    "club": (
        "club",
        "club night",
        "nightclub",
        "dj set",
        "afterparty",
        "party",
    ),
    "jazz": (
        "jazz",
        "soul",
        "blues",
    ),
    "classical": (
        "classical",
        "orchestra",
        "symphony",
        "opera",
        "chamber music",
    ),
    "metal": (
        "metal",
        "heavy metal",
        "death metal",
        "black metal",
        "metalcore",
        "hardcore",
    ),
    "latin": (
        "latin",
        "reggaeton",
        "salsa",
        "bachata",
        "cumbia",
    ),
    "funk": (
        "funk",
        "disco",
    ),
}

IGNORED_VALUES = {
    "undefined",
    "unknown",
    "n a",
    "na",
    "none",
}


def _normalize_text(value: object) -> str:
    normalized = normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")

    return " ".join(ascii_value.casefold().replace("/", " ").replace("_", " ").split())


def _matches_keyword(value: str, keyword: str) -> bool:
    normalized_keyword = _normalize_text(keyword)

    return (
        value == normalized_keyword
        or value.startswith(f"{normalized_keyword} ")
        or value.endswith(f" {normalized_keyword}")
        or f" {normalized_keyword} " in value
    )


def normalize_genres(raw_values: list[object]) -> list[str]:
    values = [_normalize_text(value) for value in raw_values]
    values = [value for value in values if value and value not in IGNORED_VALUES]
    if not values:
        return []

    genres = []
    for genre in NORMALIZED_GENRES:
        keywords = GENRE_KEYWORDS[genre]
        if any(_matches_keyword(value, keyword) for value in values for keyword in keywords):
            genres.append(genre)

    return genres or ["other"]
