from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException

from app.previsit.graph import run_finalize, run_turn
from app.schemas import (
    FinalizeRequest,
    FinalizeResponse,
    HealthResponse,
    TurnRequest,
    TurnResponse,
)
from app.settings import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("clinick.ai")

app = FastAPI(
    title="Clinick Previsit AI",
    version="0.1.0",
    description="Sidecar for patient pre-visit intake via AvalAI + LangChain.",
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    s = get_settings()
    return HealthResponse(
        status="ok",
        avalaiConfigured=s.is_configured,
        chatModels=s.chat_model_chain(),
    )


@app.post("/v1/previsit/turn", response_model=TurnResponse)
async def previsit_turn(req: TurnRequest) -> TurnResponse:
    phase = (req.phase or "STRUCTURED").upper()
    s = get_settings()
    if phase == "FREE_CHAT" and not s.is_configured:
        # Still allow finish phrases via offline path inside run_turn
        pass
    try:
        return await run_turn(req, settings=s)
    except Exception as exc:  # noqa: BLE001
        log.exception("previsit turn failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/v1/previsit/finalize", response_model=FinalizeResponse)
async def previsit_finalize(req: FinalizeRequest) -> FinalizeResponse:
    s = get_settings()
    try:
        return await run_finalize(req, settings=s)
    except Exception as exc:  # noqa: BLE001
        log.exception("previsit finalize failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
