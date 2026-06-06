from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SoundSpot"
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    ticketmaster_api_key: str = ""
    openagenda_api_key: str = ""
    openagenda_agenda_uids: str = ""
    city_search_radius_km: int = 30
    ticketmaster_max_events: int = 150
    shotgun_api_key: str = ""
    shotgun_api_base_url: str = "https://api.shotgun.live"
    shotgun_max_events: int = 200
    shotgun_search_months_ahead: int = 6
    discovery_max_events: int = 500
    discovery_months_ahead: int = 3
    discovery_cache_ttl_seconds: int = 3600
    discovery_shotgun_max_events: int = 250
    discovery_ticketmaster_max_events_per_city: int = 25
    discovery_ticketmaster_max_events_total: int = 250
    discovery_openagenda_max_events: int = 100
    discovery_openagenda_agenda_uids: str = "472484,3286118"
    discovery_ticketmaster_seed_cities: str = (
        "Paris,Lyon,Marseille,London,Manchester,Berlin,Hamburg,Amsterdam,"
        "Brussels,Madrid,Barcelona,Milan,Rome,Lisbon,Dublin,Vienna,Prague,"
        "Warsaw,Copenhagen,Stockholm,New York,Los Angeles,Chicago,Miami,"
        "San Francisco,Seattle,Toronto,Montreal,Vancouver,Tokyo,Seoul,"
        "Sydney,Melbourne,Sao Paulo,Mexico City"
    )
    geocoding_url: str = "https://nominatim.openstreetmap.org/search"
    geocoding_user_agent: str = "SoundSpot/1.0"
    backend_cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,https://soundspot.vercel.app"
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]

        frontend_origin = self.frontend_url.strip()
        if frontend_origin:
            origins.append(frontend_origin)

        if "http://localhost:5173" in origins:
            origins.append("http://127.0.0.1:5173")

        return list(dict.fromkeys(origins))

    @property
    def discovery_seed_cities(self) -> list[str]:
        return [
            city.strip()
            for city in self.discovery_ticketmaster_seed_cities.split(",")
            if city.strip()
        ]

    @property
    def openagenda_seed_agenda_uids(self) -> list[str]:
        return [
            agenda_uid.strip()
            for agenda_uid in self.openagenda_agenda_uids.split(",")
            if agenda_uid.strip()
        ]

    @property
    def discovery_openagenda_seed_agenda_uids(self) -> list[str]:
        return [
            agenda_uid.strip()
            for agenda_uid in self.discovery_openagenda_agenda_uids.split(",")
            if agenda_uid.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
