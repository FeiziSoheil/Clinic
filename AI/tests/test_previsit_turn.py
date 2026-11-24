import json

import pytest

from app.previsit.graph import run_finalize, run_turn, run_turn_offline
from app.previsit.structured import QUESTIONS_FA, is_plausible_answer, next_structured_key
from app.schemas import FinalizeRequest, TurnRequest
from app.settings import Settings


def test_next_key_starts_with_chief_complaint():
    assert next_structured_key({}) == "chief_complaint"


def test_structured_turn_asks_first_question():
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="",
        )
    )
    assert resp.phase == "STRUCTURED"
    assert "شکایت" in resp.assistant_message


def test_structured_advances_after_answer():
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="سردرد",
        )
    )
    assert resp.structured_answers["chief_complaint"] == "سردرد"
    assert QUESTIONS_FA["duration"] in resp.assistant_message


def test_structured_rejects_greeting():
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="سلام خوبی",
        )
    )
    assert "chief_complaint" not in resp.structured_answers
    assert resp.phase == "STRUCTURED"
    assert "شکایت" in resp.assistant_message or "علامت" in resp.assistant_message


def test_severity_accepts_single_digit_ascii_and_persian():
    assert is_plausible_answer("severity", "8")
    assert is_plausible_answer("severity", "1")
    assert is_plausible_answer("severity", "10")
    assert is_plausible_answer("severity", "۸")
    assert is_plausible_answer("severity", "۱۰")
    assert not is_plausible_answer("severity", "0")
    assert not is_plausible_answer("severity", "11")
    assert not is_plausible_answer("severity", "سلام")


def test_offline_severity_single_digit_advances():
    answers = {
        "chief_complaint": "سردرد",
        "duration": "۳ روز",
    }
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers=answers,
            patient_message="8",
        )
    )
    assert resp.structured_answers["severity"] == "8"
    assert QUESTIONS_FA["medications"] in resp.assistant_message


def test_structured_completes_to_free_chat():
    answers = {
        "chief_complaint": "سردرد",
        "duration": "۳ روز",
        "severity": "7",
        "medications": "هیچکدام",
        "allergies": "ندارم",
    }
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers=answers,
            patient_message="میگرن قبلی",
        )
    )
    assert resp.phase == "FREE_CHAT"
    assert "relevant_history" in resp.structured_answers
    assert "تمام" in resp.assistant_message


def test_free_chat_finish_offline():
    resp = run_turn_offline(
        TurnRequest(
            session_id="s1",
            phase="FREE_CHAT",
            structured_answers={"chief_complaint": "سردرد", "severity": "9"},
            patient_message="تمام",
        )
    )
    assert resp.phase == "FINALIZED"
    assert resp.report is not None
    assert resp.report.chief_complaint == "سردرد"
    assert any("شدت" in f for f in resp.report.notable_flags)


@pytest.mark.asyncio
async def test_run_turn_structured_async_wrapper():
    # Empty key → offline questionnaire path (no live AvalAI in unit tests).
    offline = Settings.model_validate({"AVALAI_API_KEY": ""})
    resp = await run_turn(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="درد شکم",
        ),
        settings=offline,
    )
    assert resp.structured_answers["chief_complaint"] == "درد شکم"


@pytest.mark.asyncio
async def test_finalize_with_mock_chat():
    async def fake_chat(_settings, _messages, _temperature=0.1):
        return (
            '{"chief_complaint":"سردرد","symptoms":[{"name":"سردرد","duration":"۲ روز","severity":"8"}],'
            '"medications":"ندارد","allergies":"ندارد","relevant_history":"",'
            '"notable_flags":["شدت بالا"],"summary_fa":"سردرد از ۲ روز پیش"}',
            "mock-model",
        )

    fin = await run_finalize(
        FinalizeRequest(
            session_id="s1",
            structured_answers={"chief_complaint": "سردرد"},
            messages=[],
        ),
        settings=Settings(),
        chat_fn=fake_chat,
    )
    assert fin.report.chief_complaint == "سردرد"
    assert fin.model == "mock-model"
    assert "شدت بالا" in fin.report.notable_flags


@pytest.mark.asyncio
async def test_llm_intake_from_first_message():
    async def fake_chat(_settings, _messages, _temperature=0.4):
        return (
            json.dumps(
                {
                    "assistant_message": "سلام، من کنار شما هستم تا قبل از ویزیت کمک کنم. چه مشکلی اذیتتان می‌کند؟",
                    "structured_answers": {
                        "chief_complaint": "",
                        "duration": "",
                        "severity": "",
                        "medications": "",
                        "allergies": "",
                        "relevant_history": "",
                    },
                    "phase": "STRUCTURED",
                    "offer_finish": False,
                },
                ensure_ascii=False,
            ),
            "mock-chat",
        )

    resp = await run_turn(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="",
        ),
        settings=Settings(),
        chat_fn=fake_chat,
    )
    assert "کنار شما" in resp.assistant_message
    assert resp.model == "mock-chat"


@pytest.mark.asyncio
async def test_configured_llm_failure_does_not_questionnaire_fallback():
    async def boom(_settings, _messages, _temperature=0.4):
        raise RuntimeError("Unknown scheme for proxy URL")

    configured = Settings.model_validate({"AVALAI_API_KEY": "test-key-not-used"})
    with pytest.raises(RuntimeError, match="دستیار هوشمند"):
        await run_turn(
            TurnRequest(
                session_id="s1",
                phase="STRUCTURED",
                structured_answers={},
                patient_message="",
            ),
            settings=configured,
            chat_fn=boom,
        )


@pytest.mark.asyncio
async def test_plain_text_llm_reply_is_salvaged_not_503():
    """Greeting turns often drop JSON; chat must stay available."""
    calls = {"n": 0}

    async def prose_then_still_prose(_settings, _messages, _temperature=0.4):
        calls["n"] += 1
        return (
            "سلام، ممنون، خوبم. بفرمایید چه چیزی اذیتتان می‌کند؟",
            "mock-prose",
        )

    resp = await run_turn(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="سلام خوبی",
            messages=[],
        ),
        settings=Settings.model_validate({"AVALAI_API_KEY": "test-key"}),
        chat_fn=prose_then_still_prose,
    )
    assert calls["n"] == 2  # initial + JSON retry
    assert "خوبم" in resp.assistant_message
    assert resp.phase == "STRUCTURED"
    assert resp.engine == "langchain_avalai"
    assert resp.model == "mock-prose"


@pytest.mark.asyncio
async def test_json_retry_recovers_after_prose():
    calls = {"n": 0}

    async def prose_then_json(_settings, _messages, _temperature=0.4):
        calls["n"] += 1
        if calls["n"] == 1:
            return ("سلام خوبی؟ چه مشکلی دارید؟", "mock-1")
        return (
            json.dumps(
                {
                    "assistant_message": "سلام، خوبم. شکایت اصلیتان چیست؟",
                    "structured_answers": {
                        "chief_complaint": "",
                        "duration": "",
                        "severity": "",
                        "medications": "",
                        "allergies": "",
                        "relevant_history": "",
                    },
                    "phase": "STRUCTURED",
                    "offer_finish": False,
                },
                ensure_ascii=False,
            ),
            "mock-2",
        )

    resp = await run_turn(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="سلام خوبی",
        ),
        settings=Settings.model_validate({"AVALAI_API_KEY": "test-key"}),
        chat_fn=prose_then_json,
    )
    assert calls["n"] == 2
    assert resp.model == "mock-2"
    assert "شکایت" in resp.assistant_message


@pytest.mark.asyncio
async def test_alternate_message_key_in_json():
    async def fake(_settings, _messages, _temperature=0.4):
        return (
            json.dumps({"message": "سلام، خوبم. چه مشکلی دارید؟", "phase": "STRUCTURED"}, ensure_ascii=False),
            "mock-alt",
        )

    resp = await run_turn(
        TurnRequest(
            session_id="s1",
            phase="STRUCTURED",
            structured_answers={},
            patient_message="سلام",
        ),
        settings=Settings.model_validate({"AVALAI_API_KEY": "test-key"}),
        chat_fn=fake,
    )
    assert "خوبم" in resp.assistant_message
