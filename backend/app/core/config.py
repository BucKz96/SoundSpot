from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SoundSpot"
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"
    ticketmaster_api_key: str = ""
    city_search_radius_km: int = 30
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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
