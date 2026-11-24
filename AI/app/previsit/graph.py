from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Callable

from app.llm.avalai import chat_completion, extract_json_object
from app.previsit.prompts import SYSTEM_FINALIZE, SYSTEM_INTAKE
from app.previsit.report import report_from_dict, report_from_structured_only
from app.previsit.structured import (
    FREE_CHAT_INTRO_FA,
    QUESTIONS_FA,
    REPROMPT_FA,
    STRUCTURED_KEYS,
    WARM_OFFLINE_GREETING_FA,
    is_plausible_answer,
    next_structured_key,
)
from app.schemas import (
    ChatMessage,
    FinalizeRequest,
    FinalizeResponse,
    TurnRequest,
    TurnResponse,
)
from app.settings import Settings, get_settings

log = logging.getLogger("clinick.ai.previsit")

FINISH_PHRASES = ("تمام", "تمام شد", "کافی است", "کافیه", "تموم", "finish", "done")

ChatFn = Callable[[Settings, list[dict[str, Any]], float], Awaitable[tuple[str, str]]]


def _is_finish(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    return t in FINISH_PHRASES or any(t == p for p in FINISH_PHRASES)


def _merge_answers(base: dict, incoming: dict | None) -> dict[str, str]:
    out = {k: str(base.get(k, "") or "") for k in STRUCTURED_KEYS}
    if not isinstance(incoming, dict):
        return out
    for k in STRUCTURED_KEYS:
        v = str(incoming.get(k, "") or "").strip()
        if v:
            out[k] = v
    return out


def _missing_fields(answers: dict) -> list[str]:
    return [k for k in STRUCTURED_KEYS if not str(answers.get(k, "")).strip()]


def run_turn_offline(req: TurnRequest) -> TurnResponse:
    """Fallback when AvalAI is not configured (tests / offline)."""
    answers = dict(req.structured_answers or {})
    msg = (req.patient_message or "").strip()
    phase = (req.phase or "STRUCTURED").upper()

    if phase == "STRUCTURED" or phase not in ("FREE_CHAT", "FINALIZED"):
        key = next_structured_key(answers)
        if key is None:
            return TurnResponse(
                assistant_message=FREE_CHAT_INTRO_FA,
                phase="FREE_CHAT",
                structured_answers=answers,
            )
        if not msg:
            greeting = (
                WARM_OFFLINE_GREETING_FA
                if key == "chief_complaint"
                else QUESTIONS_FA[key]
            )
            return TurnResponse(
                assistant_message=greeting,
                phase="STRUCTURED",
                structured_answers=answers,
            )
        if not is_plausible_answer(key, msg):
            return TurnResponse(
                assistant_message=REPROMPT_FA.get(key, QUESTIONS_FA[key]),
                phase="STRUCTURED",
                structured_answers=answers,
            )
        answers[key] = msg
        nxt = next_structured_key(answers)
        if nxt is None:
            return TurnResponse(
                assistant_message=FREE_CHAT_INTRO_FA,
                phase="FREE_CHAT",
                structured_answers=answers,
            )
        return TurnResponse(
            assistant_message=QUESTIONS_FA[nxt],
            phase="STRUCTURED",
            structured_answers=answers,
        )

    if _is_finish(msg):
        report = report_from_structured_only(answers, model="offline")
        return TurnResponse(
            assistant_message="گزارش پیش‌ویزیت آماده شد و برای پزشک ارسال می‌شود. متشکرم.",
            phase="FINALIZED",
            structured_answers=answers,
            report=report,
            model="offline",
        )
    return TurnResponse(
        assistant_message=(
            "اگر نکتهٔ دیگری هست بفرمایید؛ وگرنه برای ساخت گزارش بنویسید «تمام»."
        ),
        phase="FREE_CHAT",
        structured_answers=answers,
        model="offline",
    )


def _messages_to_openai(messages: list[ChatMessage]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for m in messages:
        role = (m.role or "").strip()
        if role not in ("user", "assistant", "system"):
            continue
        content = (m.content or "").strip()
        if not content:
            continue
        out.append({"role": role, "content": content})
    return out


def _parse_intake_payload(content: str, answers: dict[str, str]) -> TurnResponse:
    data = extract_json_object(content)
    reply = str(
        data.get("assistant_message")
        or data.get("reply")
        or data.get("message")
        or ""
    ).strip()
    if not reply:
        reply = "متوجه نشدم؛ لطفاً کمی بیشتر توضیح دهید."
    merged = _merge_answers(answers, data.get("structured_answers"))
    phase = str(data.get("phase") or "STRUCTURED").upper()
    if phase not in ("STRUCTURED", "FREE_CHAT", "FINALIZED"):
        phase = "STRUCTURED"
    if not _missing_fields(merged) and phase == "STRUCTURED":
        phase = "FREE_CHAT"
    offer = bool(data.get("offer_finish"))
    if offer and "تمام" not in reply:
        reply = reply.rstrip() + "\n\nاگر نکتهٔ دیگری نیست، بنویسید «تمام» تا گزارش را برای پزشک آماده کنم."
    return TurnResponse(
        assistant_message=reply,
        phase=phase,
        structured_answers=merged,
    )


def _salvage_plain_intake(content: str, answers: dict[str, str], phase: str) -> TurnResponse:
    """When the model replies in prose instead of JSON, keep the conversation alive."""
    reply = (content or "").strip()
    if not reply:
        reply = "متوجه نشدم؛ لطفاً کمی بیشتر توضیح دهید."
    # Drop accidental markdown fences if the model partially complied.
    if reply.startswith("```"):
        lines = reply.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        reply = "\n".join(lines).strip() or reply
    phase_u = (phase or "STRUCTURED").upper()
    if phase_u not in ("STRUCTURED", "FREE_CHAT", "FINALIZED"):
        phase_u = "STRUCTURED"
    return TurnResponse(
        assistant_message=reply[:2000],
        phase=phase_u,
        structured_answers=answers,
    )


_JSON_RETRY_HINT = (
    "پاسخ قبلی‌ات JSON معتبر نبود. فقط یک شیء JSON با کلیدهای "
    "assistant_message، structured_answers، phase، offer_finish برگردان؛ "
    "بدون متن اضافه و بدون markdown."
)


async def run_turn(
    req: TurnRequest,
    *,
    settings: Settings | None = None,
    chat_fn: ChatFn | None = None,
) -> TurnResponse:
    settings = settings or get_settings()
    answers = _merge_answers(dict(req.structured_answers or {}), None)
    msg = (req.patient_message or "").strip()

    if _is_finish(msg):
        fin = await run_finalize(
            FinalizeRequest(
                session_id=req.session_id,
                structured_answers=answers,
                messages=req.messages,
                locale=req.locale,
            ),
            settings=settings,
            chat_fn=chat_fn,
        )
        return TurnResponse(
            assistant_message=(
                "متشکرم. گزارش پیش‌ویزیت را آماده کردم تا پزشک قبل از ورود شما ببیند. "
                "خسته نباشید."
            ),
            phase="FINALIZED",
            structured_answers=answers,
            report=fin.report,
            model=fin.model,
            engine=fin.engine,
        )

    use_llm = settings.is_configured or chat_fn is not None
    if not use_llm:
        return run_turn_offline(req)

    chat = chat_fn or (
        lambda s, messages, temperature=0.4: chat_completion(
            s, messages, temperature=temperature
        )
    )

    history = _messages_to_openai(req.messages)
    # Avoid duplicating the latest user line if Go already appended it to messages
    if msg and history and history[-1].get("role") == "user" and history[-1].get("content") == msg:
        pass
    elif msg:
        history = [*history, {"role": "user", "content": msg}]

    missing = _missing_fields(answers)
    state_note = {
        "known_answers": {k: v for k, v in answers.items() if v},
        "still_needed": missing,
        "hint": (
            "اگر هنوز گفت‌وگو شروع نشده، با سلام گرم و معرفی کوتاه شروع کن."
            if not history
            else "ادامه بده؛ طبیعی و همدلانه."
        ),
    }
    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_INTAKE},
        {
            "role": "system",
            "content": "وضعیت جمع‌آوری فعلی:\n" + json.dumps(state_note, ensure_ascii=False),
        },
        *history,
    ]
    if not history:
        openai_messages.append(
            {
                "role": "user",
                "content": (
                    "بیمار تازه وارد گفت‌وگو شده و هنوز چیزی نفرستاده. "
                    "با لحن دستیار واقعی خوش‌آمد بگو و آرام شروع کن."
                ),
            }
        )

    try:
        content, model = await chat(settings, openai_messages, 0.45)
        try:
            resp = _parse_intake_payload(content, answers)
        except (ValueError, json.JSONDecodeError) as parse_exc:
            # Greetings / short chit-chat often make the model drop JSON and reply in prose.
            log.warning(
                "intake JSON parse failed (%r); retrying once. raw=%r",
                parse_exc,
                (content or "")[:240],
            )
            retry_messages = [
                *openai_messages,
                {"role": "assistant", "content": content},
                {"role": "user", "content": _JSON_RETRY_HINT},
            ]
            try:
                content2, model2 = await chat(settings, retry_messages, 0.2)
                resp = _parse_intake_payload(content2, answers)
                model = model2
            except Exception as retry_exc:  # noqa: BLE001
                log.warning(
                    "intake JSON retry failed (%r); salvaging plain text. raw=%r",
                    retry_exc,
                    (content or "")[:240],
                )
                resp = _salvage_plain_intake(content, answers, req.phase or "STRUCTURED")
        resp.model = model
        resp.engine = "langchain_avalai"
        return resp
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
        # When AvalAI is configured, never silently degrade to a rigid questionnaire
        # (proxy/network/credit failures must surface clearly).
        if settings.is_configured:
            if "اعتبار" in err or "credit" in err.lower() or "exhausted" in err.lower():
                raise RuntimeError(err) from exc
            log.error("intake LLM failed (no questionnaire fallback): %r", exc)
            raise RuntimeError(
                "ارتباط با دستیار هوشمند برقرار نشد. لطفاً کمی بعد دوباره تلاش کنید."
            ) from exc
        log.warning("intake LLM failed, offline fallback: %r", exc)
        return run_turn_offline(req)


async def run_finalize(
    req: FinalizeRequest,
    *,
    settings: Settings | None = None,
    chat_fn: ChatFn | None = None,
) -> FinalizeResponse:
    settings = settings or get_settings()
    answers = _merge_answers(dict(req.structured_answers or {}), None)

    if not settings.is_configured and chat_fn is None:
        report = report_from_structured_only(answers, model="offline")
        return FinalizeResponse(report=report, model="offline")

    chat = chat_fn or (
        lambda s, messages, temperature=0.1: chat_completion(
            s, messages, temperature=temperature
        )
    )
    history = _messages_to_openai(req.messages)
    user_blob = {
        "structured_answers": answers,
        "transcript": history,
    }
    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_FINALIZE},
        {
            "role": "user",
            "content": "از این داده گزارش بساز:\n" + json.dumps(user_blob, ensure_ascii=False),
        },
    ]
    try:
        content, model = await chat(settings, openai_messages, 0.1)
        data = extract_json_object(content)
        for k, v in answers.items():
            if v and not data.get(k):
                data[k] = v
        report = report_from_dict(data, model=model)
        return FinalizeResponse(report=report, model=model)
    except Exception as exc:  # noqa: BLE001
        log.warning("finalize LLM failed, falling back: %r", exc)
        report = report_from_structured_only(answers, model="offline-fallback")
        return FinalizeResponse(report=report, model=report.model)
