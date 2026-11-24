# Clinick Previsit AI sidecar

FastAPI service for patient pre-visit intake (structured questions → free chat → report) via AvalAI.

Go never holds `AVALAI_API_KEY` — only this process does.

## Setup

```bash
cd AI
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env → set AVALAI_API_KEY
```

## Run

```bash
cd AI
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8090
```

Health: `GET http://localhost:8090/health`  
Turn: `POST /v1/previsit/turn`  
Finalize: `POST /v1/previsit/finalize`

Structured questions work without an AvalAI key; free-chat + LLM finalize need `AVALAI_API_KEY`.

## Wire to Go

In `BackEnd/.env`:

```env
AI_SERVICE_URL=http://127.0.0.1:8090
PREVISIT_AI_ENABLED=true
PREVISIT_AI_TIMEOUT=30s
APP_BASE_URL=http://localhost:3000
```

FrontEnd talks only to Go (`/api/v1/previsit/...`). Never put `AVALAI_API_KEY` in Go or FrontEnd.

## Tests

```bash
cd AI
source .venv/bin/activate
PYTHONPATH=. pytest tests/ -q
```
