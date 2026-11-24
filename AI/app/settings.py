from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_ENV_FILE, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    avalai_api_key: str = Field(default="", alias="AVALAI_API_KEY")
    avalai_base_url: str = Field(
        default="https://api.avalai.ir/v1",
        alias="AVALAI_BASE_URL",
    )
    avalai_chat_model: str = Field(
        default="deepseek-chat",
        alias="AVALAI_CHAT_MODEL",
    )
    avalai_chat_fallback_models: str = Field(
        default="qwen3.6-plus,gpt-4o-mini",
        alias="AVALAI_CHAT_FALLBACK_MODELS",
    )
    # OpenAI/httpx reject socks:// from shell ALL_PROXY; default to direct egress.
    avalai_trust_env: bool = Field(default=False, alias="AVALAI_TRUST_ENV")
    avalai_http_proxy: str = Field(default="", alias="AVALAI_HTTP_PROXY")

    ai_host: str = Field(default="0.0.0.0", alias="AI_HOST")
    ai_port: int = Field(default=8090, alias="AI_PORT")
    ai_chat_timeout_sec: float = Field(default=30.0, alias="AI_CHAT_TIMEOUT_SEC")

    @property
    def is_configured(self) -> bool:
        return bool((self.avalai_api_key or "").strip())

    def chat_model_chain(self) -> list[str]:
        models = [self.avalai_chat_model.strip()]
        for part in self.avalai_chat_fallback_models.split(","):
            m = part.strip()
            if m and m not in models:
                models.append(m)
        return [m for m in models if m]


@lru_cache
def get_settings() -> Settings:
    return Settings()
