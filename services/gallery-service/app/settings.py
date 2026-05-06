from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "gallery-service"
    database_url: str
    log_level: str = "INFO"
    gallery_cache_ttl_seconds: float = 60.0
    gallery_cache_size: int = 128


settings = Settings()  # type: ignore[call-arg]
