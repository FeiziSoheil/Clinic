from __future__ import annotations

import json
import logging
from typing import Any, Callable, Awaitable

import httpx
from openai import AsyncOpenAI

from app.settings import Settings

log = logging.getLogger("clinick.ai.avalai")

ChatFn = Callable[[Settings, list[dict[str, Any]], str], Awaitable[tuple[str, str]]]


def _build_http_client(settings: Settings) -> httpx.AsyncClient:
    """Outbound AvalAI client that ignores broken shell SOCKS proxies by default.

    Shell env often sets ALL_PROXY=socks://127.0.0.1:... which OpenAI/httpx cannot
    parse without socks extras. Prefer trust_env=False unless explicitly enabled,
    and only honor AVALAI_HTTP_PROXY when set to an AvalAI-compatible URL (http/https).
    """
    proxy = (settings.avalai_http_proxy or "").strip() or None
    if proxy and proxy.lower().startswith("socks"):
        log.warning(
            "AVALAI_HTTP_PROXY is socks:// which OpenAI httpx rejects; "
            "calling AvalAI without proxy"
        )
        proxy = None
    return httpx.AsyncClient(
        trust_env=bool(settings.avalai_trust_env),
        proxy=proxy,
        timeout=settings.ai_chat_timeout_sec,
    )


async def chat_completion(
    settings: Settings,
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0.2,
) -> tuple[str, str]:
    """Return (content, model_used). Tries chat_model_chain fallbacks."""
    key = (settings.avalai_api_key or "").strip()
    if not key:
        raise RuntimeError("AVALAI_API_KEY is not configured")

    http_client = _build_http_client(settings)
    client = AsyncOpenAI(
        api_key=key,
        base_url=settings.avalai_base_url.rstrip("/"),
        timeout=settings.ai_chat_timeout_sec,
        http_client=http_client,
    )
    last_err: Exception | None = None
    try:
        for model in settings.chat_model_chain():
            try:
                resp = await client.chat.completions.create(
                    model=model,
                    temperature=temperature,
                    messages=messages,
                )
                content = (resp.choices[0].message.content or "").strip()
                return content, model
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                log.warning("avalai model %s error: %r", model, exc)
                continue
    finally:
        await http_client.aclose()

    err_str = str(last_err).lower()
    if "credit" in err_str and (
        "exhaust" in err_str or "not enough" in err_str or "429" in err_str
    ):
        raise RuntimeError(
            "اعتبار مالی حساب AvalAI به پایان رسیده است. لطفاً نسبت به شارژ حساب اقدام کنید."
        )
    raise RuntimeError(f"all AvalAI chat models failed: {last_err}")


def extract_json_object(text: str) -> dict[str, Any]:
    raw = text.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < 0 or end <= start:
        raise ValueError("no JSON object in model response")
    return json.loads(raw[start : end + 1])
