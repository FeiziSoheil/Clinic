from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str = "ok"
    avalaiConfigured: bool = False
    chatModels: list[str] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: str
    content: str


class PreVisitReport(BaseModel):
    chief_complaint: str = ""
    symptoms: list[dict] = Field(default_factory=list)
    medications: str = ""
    allergies: str = ""
    relevant_history: str = ""
    notable_flags: list[str] = Field(default_factory=list)
    summary_fa: str = ""
    model: str = ""
    engine: str = "langchain_avalai"


class TurnRequest(BaseModel):
    session_id: str
    phase: str  # STRUCTURED | FREE_CHAT
    structured_answers: dict = Field(default_factory=dict)
    messages: list[ChatMessage] = Field(default_factory=list)
    patient_message: str = ""
    locale: str = "fa"

    @field_validator("messages", mode="before")
    @classmethod
    def _null_messages_to_empty(cls, v: Any) -> Any:
        # Go json.Marshal encodes nil slice as null.
        return [] if v is None else v

    @field_validator("structured_answers", mode="before")
    @classmethod
    def _null_answers_to_empty(cls, v: Any) -> Any:
        return {} if v is None else v


class TurnResponse(BaseModel):
    assistant_message: str
    phase: str
    structured_answers: dict = Field(default_factory=dict)
    report: PreVisitReport | None = None
    model: str = ""
    engine: str = "langchain_avalai"


class FinalizeRequest(BaseModel):
    session_id: str
    structured_answers: dict = Field(default_factory=dict)
    messages: list[ChatMessage] = Field(default_factory=list)
    locale: str = "fa"

    @field_validator("messages", mode="before")
    @classmethod
    def _null_messages_to_empty(cls, v: Any) -> Any:
        return [] if v is None else v

    @field_validator("structured_answers", mode="before")
    @classmethod
    def _null_answers_to_empty(cls, v: Any) -> Any:
        return {} if v is None else v


class FinalizeResponse(BaseModel):
    report: PreVisitReport
    model: str = ""
    engine: str = "langchain_avalai"
