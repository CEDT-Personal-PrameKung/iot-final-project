"""Application settings loaded from environment variables or a local .env file."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    cors_origins: str = ""
    database_url: str | None = None
    telemetry_database_url: str | None = None
    emqx_host: str | None = None
    emqx_port: int = Field(default=8883, ge=1, le=65535)
    emqx_username: str | None = None
    emqx_password: SecretStr | None = None
    emqx_client_id: str = "smart-parking-backend"
    emqx_ca_cert_path: str | None = None
    app_secret_key: SecretStr | None = None
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
