from __future__ import annotations

from typing import Any

from app.schemas import PreVisitReport


def report_from_dict(data: dict[str, Any], *, model: str = "") -> PreVisitReport:
    symptoms = data.get("symptoms") or []
    if not isinstance(symptoms, list):
        symptoms = []
    flags = data.get("notable_flags") or []
    if not isinstance(flags, list):
        flags = []
    return PreVisitReport(
        chief_complaint=str(data.get("chief_complaint") or ""),
        symptoms=[s for s in symptoms if isinstance(s, dict)],
        medications=str(data.get("medications") or ""),
        allergies=str(data.get("allergies") or ""),
        relevant_history=str(data.get("relevant_history") or ""),
        notable_flags=[str(f) for f in flags],
        summary_fa=str(data.get("summary_fa") or ""),
        model=model,
        engine="langchain_avalai",
    )


def report_from_structured_only(answers: dict, *, model: str = "") -> PreVisitReport:
    """Deterministic fallback when LLM finalize is unavailable."""
    severity = str(answers.get("severity") or "").strip()
    flags: list[str] = []
    try:
        if severity and int("".join(ch for ch in severity if ch.isdigit()) or "0") >= 8:
            flags.append(f"بیمار شدت را {severity} گزارش کرده است")
    except ValueError:
        pass
    summary_parts = []
    if answers.get("chief_complaint"):
        summary_parts.append(f"شکایت اصلی: {answers['chief_complaint']}")
    if answers.get("duration"):
        summary_parts.append(f"مدت: {answers['duration']}")
    if severity:
        summary_parts.append(f"شدت: {severity}")
    return PreVisitReport(
        chief_complaint=str(answers.get("chief_complaint") or ""),
        symptoms=[
            {
                "name": str(answers.get("chief_complaint") or ""),
                "duration": str(answers.get("duration") or ""),
                "severity": severity,
            }
        ]
        if answers.get("chief_complaint")
        else [],
        medications=str(answers.get("medications") or ""),
        allergies=str(answers.get("allergies") or ""),
        relevant_history=str(answers.get("relevant_history") or ""),
        notable_flags=flags,
        summary_fa="؛ ".join(summary_parts),
        model=model or "offline",
        engine="langchain_avalai",
    )
