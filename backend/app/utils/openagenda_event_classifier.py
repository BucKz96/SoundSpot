from dataclasses import dataclass
import re
from unicodedata import normalize

from app.utils.genre_normalizer import normalize_genres

MUSIC_SIGNALS = {
    "fete_music": ("fete de la musique",),
    "concert": ("concert",),
    "music": ("musique", "music", "musical"),
    "festival": ("festival",),
    "live": ("live",),
    "club": ("club",),
    "dj": ("dj", "dj set"),
    "techno": ("techno",),
    "electronic": ("electro", "electronic", "electronique"),
    "house": ("house",),
    "rock": ("rock",),
    "metal": ("metal",),
    "rap": ("rap", "hip hop", "hip-hop"),
    "jazz": ("jazz",),
    "classical": ("classical", "classique", "opera", "orchestre", "chorale"),
    "pop": ("pop",),
    "funk": ("funk",),
    "reggae": ("reggae",),
    "soul": ("soul", "r&b", "rnb"),
    "latin": ("latin", "salsa", "bachata", "reggaeton"),
    "chanson": ("chanson",),
}

GENRE_ALIASES = {
    "fete_music": "festival",
    "music": "other",
    "live": "other",
    "dj": "electronic",
    "classical": "classical",
    "reggae": "latin",
    "soul": "jazz",
    "chanson": "pop",
}

EXCLUSION_SIGNALS = (
    "brocante",
    "vide grenier",
    "vide-grenier",
    "conference",
    "atelier",
    "visite",
    "visite guidee",
    "exposition",
    "marche",
    "pop up",
    "createurs",
    "sport",
    "yoga",
    "formation",
    "projection",
    "cinema",
)

STRONG_MUSIC_SIGNALS = {
    "fete_music",
    "concert",
    "festival",
    "dj",
    "techno",
    "electronic",
    "house",
    "rock",
    "metal",
    "rap",
    "jazz",
    "classical",
}

EXPLICIT_PERFORMANCE_SIGNALS = {
    "fete_music",
    "concert",
    "festival",
    "live",
    "club",
    "dj",
}

@dataclass(frozen=True)
class OpenAgendaEventClassification:
    is_music_event: bool
    genres: list[str]
    signals: list[str]
    exclusion_signals: list[str]


def _normalize_text(value: object) -> str:
    text_value = str(value or "").replace("'", " ").replace("\u2019", " ").replace("`", " ")
    normalized = normalize("NFKD", text_value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned_value = re.sub(r"[^a-zA-Z0-9&]+", " ", ascii_value)
    return " ".join(cleaned_value.casefold().split())


def _text_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        values = []
        for item in value.values():
            values.extend(_text_values(item))
        return values
    if isinstance(value, list):
        values = []
        for item in value:
            values.extend(_text_values(item))
        return values
    if value is None:
        return []
    return [str(value)]


def collect_openagenda_text_values(event: dict) -> list[str]:
    location = event.get("location") or {}
    values = []

    for key in ("title", "description", "longDescription", "keywords"):
        values.extend(_text_values(event.get(key)))

    for key in ("tags", "types-de-lieu", "types-de-lieux"):
        values.extend(_text_values(location.get(key)))

    return [value for value in values if str(value or "").strip()]


def _contains_signal(blob: str, signal: str) -> bool:
    normalized_signal = _normalize_text(signal)
    return (
        blob == normalized_signal
        or blob.startswith(f"{normalized_signal} ")
        or blob.endswith(f" {normalized_signal}")
        or f" {normalized_signal} " in blob
    )


def classify_openagenda_event(event: dict) -> OpenAgendaEventClassification:
    text_values = collect_openagenda_text_values(event)
    normalized_values = [_normalize_text(value) for value in text_values]
    blob = " ".join(normalized_values)
    title_blob = " ".join(_normalize_text(value) for value in _text_values(event.get("title")))
    signals = []
    genre_values = []

    for signal_name, keywords in MUSIC_SIGNALS.items():
        if any(_contains_signal(blob, keyword) for keyword in keywords):
            signals.append(signal_name)
            genre_values.append(GENRE_ALIASES.get(signal_name, signal_name))

    exclusion_signals = [
        signal for signal in EXCLUSION_SIGNALS if _contains_signal(blob, signal)
    ]
    title_exclusion_signals = [
        signal for signal in EXCLUSION_SIGNALS if _contains_signal(title_blob, signal)
    ]
    strong_signal_count = sum(1 for signal in signals if signal in STRONG_MUSIC_SIGNALS)
    genres = normalize_genres(genre_values)
    reliable_genres = [genre for genre in genres if genre != "other"]
    is_music_event = bool(
        strong_signal_count > 0
        or reliable_genres
        or ("music" in signals and len(signals) >= 2)
    )

    has_explicit_performance = any(
        signal in EXPLICIT_PERFORMANCE_SIGNALS for signal in signals
    )
    if title_exclusion_signals or (exclusion_signals and not has_explicit_performance):
        is_music_event = False

    return OpenAgendaEventClassification(
        is_music_event=is_music_event,
        genres=(reliable_genres or ["other"]) if is_music_event else [],
        signals=signals,
        exclusion_signals=exclusion_signals,
    )
