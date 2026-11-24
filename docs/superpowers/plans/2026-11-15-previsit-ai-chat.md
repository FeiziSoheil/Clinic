# Pre-visit AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After booking, patients complete a hybrid AI pre-visit chat; doctors see a structured report (+ optional transcript) at visit time and can fill an EHR SOAP draft without auto-saving the official record.

**Architecture:** Go owns `PreVisitSession` / messages / final report and RBAC. New root `AI/` FastAPI sidecar (LangChain + AvalAI) handles turns and finalize. FrontEnd talks only to Go. Pattern mirrors AMLAK `AI/` (`AI_SERVICE_URL`, key only in Python).

**Tech Stack:** Go (Echo, Mongo), Next.js/React Query, Python FastAPI, LangChain, AvalAI OpenAI-compatible API (`https://api.avalai.ir/v1`).

**Spec:** `docs/superpowers/specs/2026-11-15-previsit-ai-chat-design.md`

## Global Constraints

- No diagnosis, prescribing, or definitive treatment advice in prompts or UI copy.
- `AVALAI_API_KEY` only in `AI/.env` — never in Go or FrontEnd.
- Front → Go only; Go → AI via internal `AI_SERVICE_URL`.
- Pre-visit is recommended, never blocks check-in/visit.
- Do not mutate `TriageNote` or auto-write `MedicalRecord`.
- AI sidecar is **stateless**: Go sends full `messages` each turn.
- Fixed v1 structured questions (Persian labels in UI/prompts):
  1. `chief_complaint` — شکایت اصلی چیست؟
  2. `duration` — از کی شروع شده؟
  3. `severity` — شدت از ۱ تا ۱۰؟
  4. `medications` — داروهای مصرفی فعلی؟
  5. `allergies` — حساسیت دارویی/غذایی؟
  6. `relevant_history` — سابقه مرتبط؟
- EHR draft mapping: fill SOAP **subjective** from report (`chief_complaint` + symptoms + `summary_fa` + meds/allergies/history text). Never auto-fill assessment/plan from AI flags.
- Deep link base: `{AppBaseURL}/appointments/previsit/{appointmentId}`

---

## File map

| Path | Responsibility |
| --- | --- |
| `AI/app/settings.py` | AvalAI env (AMLAK-compatible) |
| `AI/app/llm/avalai.py` | Chat client + model fallback chain |
| `AI/app/previsit/*` | Prompts, structured Qs, turn, finalize, report schema |
| `AI/app/main.py` | `/health`, `/v1/previsit/turn`, `/v1/previsit/finalize` |
| `BackEnd/internal/previsit/*.go` | Domain, service, handler, AI client |
| `BackEnd/pkg/config/config.go` | `AIServiceURL`, `PrevisitAIEnabled`, `PrevisitAITimeout` |
| `BackEnd/cmd/clinic-api/bootstrap/*` | Wire repos, routes, booking hooks |
| `BackEnd/internal/notification/service.go` | `NotifyPreVisitInvite` |
| `BackEnd/internal/booking/service.go` | Create session on book; expire on cancel |
| `FrontEnd/src/types/previsit.ts` | DTOs |
| `FrontEnd/src/lib/previsit-api.ts` | HTTP helpers |
| `FrontEnd/src/hooks/usePrevisit.ts` | React Query hooks |
| `FrontEnd/src/app/(patient)/appointments/previsit/[appointmentId]/page.tsx` | Patient chat |
| `FrontEnd/src/app/(patient)/appointments/page.tsx` | CTA + status |
| `FrontEnd/src/app/doctor/patients/[id]/ehr/_components/PreVisitReportPanel.tsx` | Doctor report + transcript + draft fill |
| `FrontEnd/src/app/doctor/patients/[id]/ehr/page.tsx` | Accordion item + wire draft into SOAP |

---

### Task 1: AI sidecar scaffold + AvalAI settings + health

**Files:**
- Create: `AI/requirements.txt`, `AI/.env.example`, `AI/README.md`
- Create: `AI/app/__init__.py`, `AI/app/settings.py`, `AI/app/schemas.py`, `AI/app/main.py`
- Create: `AI/app/llm/__init__.py`, `AI/app/llm/avalai.py`
- Create: `AI/tests/test_health.py`

**Interfaces:**
- Produces: `get_settings() -> Settings` with `is_configured`, `chat_model_chain()`; `GET /health` → `{ status, avalaiConfigured, chatModels }`

- [ ] **Step 1: Create requirements and env example**

`AI/requirements.txt`:

```text
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
httpx>=0.27.0
openai>=1.0.0
pydantic>=2.9.0
pydantic-settings>=2.5.0
python-dotenv>=1.0.0
langchain>=0.3.0
langchain-openai>=0.2.0
pytest>=8.0.0
pytest-asyncio>=0.24.0
```

`AI/.env.example`:

```env
AVALAI_API_KEY=
AVALAI_BASE_URL=https://api.avalai.ir/v1
AVALAI_CHAT_MODEL=deepseek-chat
AVALAI_CHAT_FALLBACK_MODELS=qwen3.6-plus,gpt-4o-mini
AI_HOST=0.0.0.0
AI_PORT=8090
AI_CHAT_TIMEOUT_SEC=30
```

- [ ] **Step 2: Write failing health test**

```python
# AI/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

def test_health_ok():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "avalaiConfigured" in body
```

- [ ] **Step 3: Run test — expect fail (no app)**

Run: `cd AI && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && pytest tests/test_health.py -v`  
Expected: import/collection failure or 404 until Step 4.

- [ ] **Step 4: Implement settings, schemas, main health**

Copy AMLAK-style `Settings` (`avalai_api_key`, `avalai_base_url`, `avalai_chat_model`, `avalai_chat_fallback_models`, `chat_model_chain()`, `is_configured`).

```python
# AI/app/schemas.py (excerpt)
from pydantic import BaseModel, Field

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

class FinalizeResponse(BaseModel):
    report: PreVisitReport
    model: str = ""
    engine: str = "langchain_avalai"
```

`main.py`: FastAPI title `Clinick Previsit AI`; `GET /health` only for this task.

- [ ] **Step 5: Re-run health test — PASS**

- [ ] **Step 6: Commit**

```bash
git add AI/
git commit -m "$(cat <<'EOF'
feat(ai): scaffold previsit FastAPI sidecar with AvalAI settings

EOF
)"
```

---

### Task 2: Previsit turn + finalize (LangChain + AvalAI)

**Files:**
- Create: `AI/app/previsit/__init__.py`, `prompts.py`, `structured.py`, `report.py`, `graph.py`
- Create: `AI/app/llm/avalai.py`
- Modify: `AI/app/main.py` — wire `POST /v1/previsit/turn`, `POST /v1/previsit/finalize`
- Create: `AI/tests/test_previsit_turn.py`

**Interfaces:**
- Consumes: `Settings`, AvalAI chat
- Produces: `run_turn(req: TurnRequest) -> TurnResponse`, `run_finalize(req: FinalizeRequest) -> FinalizeResponse`

- [ ] **Step 1: Define structured question order**

```python
# AI/app/previsit/structured.py
STRUCTURED_KEYS = [
    "chief_complaint",
    "duration",
    "severity",
    "medications",
    "allergies",
    "relevant_history",
]

QUESTIONS_FA = {
    "chief_complaint": "شکایت اصلی‌تان چیست؟",
    "duration": "این مشکل از چه زمانی شروع شده؟",
    "severity": "شدت علائم را از ۱ تا ۱۰ چقدر می‌دانید؟",
    "medications": "الان چه داروهایی مصرف می‌کنید؟ (اگر ندارید بنویسید هیچکدام)",
    "allergies": "حساسیت دارویی یا غذایی دارید؟",
    "relevant_history": "سابقه بیماری یا مشکل مرتبطی دارید که پزشک باید بداند؟",
}

def next_structured_key(answers: dict) -> str | None:
    for k in STRUCTURED_KEYS:
        if not str(answers.get(k, "")).strip():
            return k
    return None
```

- [ ] **Step 2: Write failing tests for STRUCTURED phase (no live LLM)**

```python
# AI/tests/test_previsit_turn.py
from app.previsit.structured import next_structured_key, QUESTIONS_FA
from app.previsit.graph import run_turn_offline
from app.schemas import TurnRequest

def test_next_key_starts_with_chief_complaint():
    assert next_structured_key({}) == "chief_complaint"

def test_structured_turn_asks_first_question():
    resp = run_turn_offline(TurnRequest(
        session_id="s1",
        phase="STRUCTURED",
        structured_answers={},
        patient_message="",
    ))
    assert resp.phase == "STRUCTURED"
    assert QUESTIONS_FA["chief_complaint"] in resp.assistant_message

def test_structured_advances_after_answer():
    resp = run_turn_offline(TurnRequest(
        session_id="s1",
        phase="STRUCTURED",
        structured_answers={},
        patient_message="سردرد",
    ))
    assert resp.structured_answers["chief_complaint"] == "سردرد"
    assert QUESTIONS_FA["duration"] in resp.assistant_message
```

Implement `run_turn_offline` for STRUCTURED without LLM; FREE_CHAT/finalize use LLM behind a injectable client (tests mock).

- [ ] **Step 3: Run tests — FAIL then implement structured path in `graph.py`**

Logic:
1. If `phase==STRUCTURED` and `patient_message` and a next key exists → store answer for that key, ask next or switch to `FREE_CHAT` with prompt inviting free details.
2. If `phase==FREE_CHAT` → call AvalAI/LangChain with system prompt forbidding diagnosis; return clarifying question or suggest finish.
3. When patient message matches finish intents (`تمام`, `تمام شد`, `کافی است`) or model sets done → `phase=FINALIZED` and optionally include report from finalize helper.

- [ ] **Step 4: Implement AvalAI chat wrapper**

```python
# AI/app/llm/avalai.py — AsyncOpenAI(base_url=settings.avalai_base_url, api_key=...)
# Try models in chat_model_chain(); on failure try next (same as AMLAK assistant.py)
```

LangChain: use `ChatOpenAI` with `base_url`/`api_key` pointing at AvalAI for FREE_CHAT + structured report extraction in finalize.

- [ ] **Step 5: Implement finalize with structured output**

System rules in `prompts.py`:
- Persian
- No diagnosis / meds recommendation / urgency triage actions
- Output JSON matching `PreVisitReport` (without inventing facts not in messages/answers)
- `notable_flags`: short attentions for the doctor only (e.g. "بیمار شدت را ۹/۱۰ گزارش کرده")

- [ ] **Step 6: Wire HTTP routes; 503 if AvalAI not configured for FREE_CHAT/finalize**

STRUCTURED-only turns may work without key; FREE_CHAT/finalize require key.

- [ ] **Step 7: Tests PASS (mock LLM for free/finalize)**

- [ ] **Step 8: Commit**

```bash
git add AI/
git commit -m "$(cat <<'EOF'
feat(ai): add previsit structured+free chat turn and finalize

EOF
)"
```

---

### Task 3: Go `previsit` domain + persistence (no AI yet)

**Files:**
- Create: `BackEnd/internal/previsit/previsit.go`
- Create: `BackEnd/internal/previsit/service.go`
- Create: `BackEnd/internal/previsit/service_test.go`

**Interfaces:**
- Produces:
  - `CreateForAppointment(ctx, appointmentID, patientID, doctorID string) (*SessionResponse, error)`
  - `GetByAppointment(ctx, appointmentID, requesterID, role string) (*SessionResponse, error)`
  - `ListMessages(ctx, sessionID, requesterID, role string) ([]MessageResponse, error)`
  - `ExpireByAppointment(ctx, appointmentID string) error`
  - Status/phase constants matching spec

- [ ] **Step 1: Write failing service test for create + unique active session**

```go
func TestCreateForAppointment_Idempotent(t *testing.T) {
    // use mongo testcontainer OR skip if no MONGO_URI — prefer in-memory fake repo interface
}
```

Prefer a small `SessionStore` interface in service for unit tests without Mongo:

```go
type SessionStore interface {
    Insert(ctx context.Context, s PreVisitSession) error
    FindActiveByAppointment(ctx context.Context, appointmentID primitive.ObjectID) (*PreVisitSession, error)
    Update(ctx context.Context, s PreVisitSession) error
    // ...
}
type MessageStore interface {
    Insert(ctx context.Context, m PreVisitMessage) error
    ListBySession(ctx context.Context, sessionID primitive.ObjectID) ([]PreVisitMessage, error)
}
```

- [ ] **Step 2: Implement entities in `previsit.go`**

Statuses: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`  
Phases: `STRUCTURED`, `FREE_CHAT`, `FINALIZED`  
Embed `PreVisitReport` with BSON/JSON tags matching AI schema (`chief_complaint`, `symptoms`, `medications`, `allergies`, `relevant_history`, `notable_flags`, `summary_fa`, `model`, `engine`).

- [ ] **Step 3: Implement service create/get/expire + RBAC checks**

- Patient may only access own `patient_id`
- Doctor may only access sessions where `doctor_id` matches (admin allowed)
- `CreateForAppointment`: if active exists, return it; else insert `PENDING` / phase `STRUCTURED`

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add BackEnd/internal/previsit/
git commit -m "$(cat <<'EOF'
feat(previsit): add session domain and persistence service

EOF
)"
```

---

### Task 4: Go AI HTTP client + turn/finalize orchestration

**Files:**
- Create: `BackEnd/internal/previsit/ai_client.go`
- Create: `BackEnd/internal/previsit/ai_client_test.go`
- Modify: `BackEnd/internal/previsit/service.go` — `PatientTurn`, `FinalizeIfNeeded`
- Modify: `BackEnd/pkg/config/config.go` — AI fields

**Interfaces:**
- Produces:
  - `type AIClient interface { Turn(ctx, TurnRequest) (*TurnResponse, error); Finalize(ctx, FinalizeRequest) (*FinalizeResponse, error) }`
  - `PatientTurn(ctx, appointmentID, patientID, message string) (*TurnResult, error)`

- [ ] **Step 1: Add config**

```go
// Config fields:
AIServiceURL string
PrevisitAIEnabled bool
PrevisitAITimeout time.Duration // default 30s

// env:
// AI_SERVICE_URL=http://127.0.0.1:8090
// PREVISIT_AI_ENABLED=true
// PREVISIT_AI_TIMEOUT=30s
```

- [ ] **Step 2: Failing test for AI client JSON round-trip with `httptest`**

```go
func TestHTTPAIClient_Turn(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path != "/v1/previsit/turn" { t.Fatalf("path %s", r.URL.Path) }
        _ = json.NewEncoder(w).Encode(map[string]any{
            "assistant_message": "سوال بعدی",
            "phase": "STRUCTURED",
            "structured_answers": map[string]string{"chief_complaint": "سردرد"},
            "report": nil,
            "model": "deepseek-chat",
            "engine": "langchain_avalai",
        })
    }))
    defer srv.Close()
    c := NewHTTPAIClient(srv.URL, 2*time.Second)
    resp, err := c.Turn(context.Background(), AITurnRequest{SessionID: "s", Phase: "STRUCTURED", PatientMessage: "سردرد"})
    if err != nil { t.Fatal(err) }
    if resp.AssistantMessage == "" { t.Fatal("empty") }
}
```

- [ ] **Step 3: Implement client (AMLAK-style POST JSON)**

- [ ] **Step 4: Implement `PatientTurn`**

1. Load session; verify patient; reject if `EXPIRED`
2. Set `IN_PROGRESS` if `PENDING`
3. Append user message if non-empty
4. Load messages; call AI `Turn`
5. Persist assistant message; update `structured_answers`, `phase`
6. If AI `phase==FINALIZED`: if `report!=nil` save it + `COMPLETED`; else call `Finalize`, save report, `COMPLETED`
7. On AI error: return typed error (do not expire session); appointment unaffected

- [ ] **Step 5: Doctor `GetReport` / `GetTranscript` helpers**

- [ ] **Step 6: Tests PASS**

- [ ] **Step 7: Commit**

```bash
git add BackEnd/internal/previsit/ BackEnd/pkg/config/config.go
git commit -m "$(cat <<'EOF'
feat(previsit): wire AvalAI sidecar client and patient turn flow

EOF
)"
```

---

### Task 5: HTTP handlers, bootstrap, booking hooks, notification

**Files:**
- Create: `BackEnd/internal/previsit/handler.go`
- Modify: `BackEnd/cmd/clinic-api/bootstrap/app.go`, `routes.go`
- Modify: `BackEnd/internal/booking/service.go` — after successful book; on cancel
- Modify: `BackEnd/internal/notification/service.go` — invite SMS
- Modify: booking notifier interface if needed

**Interfaces:**
- Public routes under `/api/v1/previsit` (JWT):
  - `POST /appointments/:appointmentId/session` — ensure/create (patient)
  - `GET /appointments/:appointmentId` — session status + report if completed (role-aware; patient without flags? Spec: patient sees status; hide `notable_flags` from patient responses)
  - `POST /appointments/:appointmentId/turn` — body `{ "message": "..." }`
  - `GET /appointments/:appointmentId/messages` — transcript (doctor/admin; patient may read own chat)
- Notification: `NotifyPreVisitInvite(ctx, patientID, doctorName, appointmentTime, link string)`

- [ ] **Step 1: Implement handler with RoleAuth patterns matching EHR**

Patient turn: role patient + owns appointment.  
Doctor get: role doctor + owns doctor_id (or admin).

Patient session GET: strip `notable_flags` from report DTO (or omit report details beyond “completed”).

- [ ] **Step 2: Bootstrap**

```go
previsitSessionRepo := database.NewRepository[previsit.PreVisitSession](db.Collection("previsit_sessions"))
previsitMsgRepo := database.NewRepository[previsit.PreVisitMessage](db.Collection("previsit_messages"))
var previsitAI previsit.AIClient
if cfg.PrevisitAIEnabled && cfg.AIServiceURL != "" {
    previsitAI = previsit.NewHTTPAIClient(cfg.AIServiceURL, cfg.PrevisitAITimeout)
}
previsitSvc := previsit.NewService(...)
previsitH := previsit.NewHandler(previsitSvc)
// register on JWT group
```

- [ ] **Step 3: Booking integration**

After successful `BookAppointment`: call `previsitSvc.CreateForAppointment` (best-effort log on error).  
Optionally send `NotifyPreVisitInvite` with `fmt.Sprintf("%s/appointments/previsit/%s", cfg.AppBaseURL, apptID)` — can send on confirm if booking is PENDING until confirm; **prefer on ConfirmAppointment** if that is when patient is notified today, else on book. Match existing confirmation timing in `BookAppointment` / `ConfirmAppointment`.

On cancel: `ExpireByAppointment`.

- [ ] **Step 4: Add `NotifyPreVisitInvite` Persian message**

```text
بیمار گرامی، قبل از مراجعه می‌توانید با دستیار پیش‌ویزیت صحبت کنید تا گزارش آماده‌ای برای پزشکتان آماده شود.
لینک: {link}
```

- [ ] **Step 5: Manual smoke**

Run AI on `:8090`, API with env flags, `curl` turn as patient.

- [ ] **Step 6: Commit**

```bash
git add BackEnd/
git commit -m "$(cat <<'EOF'
feat(previsit): expose APIs and hook booking plus invite notification

EOF
)"
```

---

### Task 6: FrontEnd types, API client, hooks

**Files:**
- Create: `FrontEnd/src/types/previsit.ts`
- Create: `FrontEnd/src/lib/previsit-api.ts`
- Create: `FrontEnd/src/hooks/usePrevisit.ts`

**Interfaces:**
- Produces: `ensurePrevisitSession`, `fetchPrevisitSession`, `postPrevisitTurn`, `fetchPrevisitMessages`
- Hooks: `usePrevisitSession(appointmentId)`, `usePrevisitTurn()`, `usePrevisitMessages(appointmentId, enabled)`

- [ ] **Step 1: Types matching Go JSON**

```ts
export type PreVisitStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
export type PreVisitPhase = "STRUCTURED" | "FREE_CHAT" | "FINALIZED";

export interface PreVisitReport {
  chief_complaint: string;
  symptoms: Array<{ name?: string; duration?: string; severity?: string | number }>;
  medications: string;
  allergies: string;
  relevant_history: string;
  notable_flags?: string[];
  summary_fa: string;
  model?: string;
  engine?: string;
}

export interface PreVisitSession {
  id: string;
  appointment_id: string;
  status: PreVisitStatus;
  phase: PreVisitPhase;
  structured_answers: Record<string, string>;
  report: PreVisitReport | null;
  completed_at?: string;
}
```

- [ ] **Step 2: API helpers via existing Axios instance** (same base URL pattern as `ehr-api.ts`)

- [ ] **Step 3: Hooks with query keys `["previsit", appointmentId]`**

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/types/previsit.ts FrontEnd/src/lib/previsit-api.ts FrontEnd/src/hooks/usePrevisit.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add previsit API types and React Query hooks

EOF
)"
```

---

### Task 7: Patient chat UI + appointments CTA

**Files:**
- Create: `FrontEnd/src/app/(patient)/appointments/previsit/[appointmentId]/page.tsx`
- Create: `FrontEnd/src/app/(patient)/appointments/previsit/_components/PrevisitChat.tsx`
- Modify: `FrontEnd/src/app/(patient)/appointments/page.tsx` — status chip + link

**Interfaces:**
- Consumes: hooks from Task 6
- Route: `/appointments/previsit/[appointmentId]`

- [ ] **Step 1: Chat page**

On mount: `ensurePrevisitSession` then load session.  
If no messages yet, call `turn` with empty message to get first structured question.  
UI: message list (user/assistant), input, send, button «اتمام و ساخت گزارش» that sends finish phrase or dedicated finalize turn (`message: "تمام"`).  
Show status badge; on `COMPLETED` show short summary_fa read-only + option to revise (continue chatting → re-finalize).

Copy: clarify this is not a doctor and not for emergencies.

- [ ] **Step 2: Appointments list CTA**

For upcoming appointments: «آماده‌سازی پیش‌ویزیت» linking to previsit route; show تکمیل‌شده / شروع نشده.

- [ ] **Step 3: Manual UI check RTL/mobile**

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/app/\(patient\)/appointments/
git commit -m "$(cat <<'EOF'
feat(frontend): add patient previsit chat and appointment CTA

EOF
)"
```

---

### Task 8: Doctor report panel + SOAP draft fill

**Files:**
- Create: `FrontEnd/src/app/doctor/patients/[id]/ehr/_components/PreVisitReportPanel.tsx`
- Modify: `FrontEnd/src/app/doctor/patients/[id]/ehr/page.tsx`
- Modify: `FrontEnd/src/app/doctor/patients/[id]/ehr/_components/SoapNotesForm.tsx` — accept optional `draftSubjective` / `onDraftApplied` or lift SOAP state

**Interfaces:**
- Consumes: `usePrevisitSession`, `usePrevisitMessages`
- Produces: `buildSubjectiveDraft(report: PreVisitReport): string`

- [ ] **Step 1: Draft mapper**

```ts
export function buildSubjectiveDraft(r: PreVisitReport): string {
  const lines = [
    r.chief_complaint && `شکایت اصلی: ${r.chief_complaint}`,
    r.summary_fa && `خلاصه پیش‌ویزیت: ${r.summary_fa}`,
    r.medications && `داروها: ${r.medications}`,
    r.allergies && `حساسیت‌ها: ${r.allergies}`,
    r.relevant_history && `سابقه: ${r.relevant_history}`,
  ].filter(Boolean);
  return lines.join("\n");
}
```

- [ ] **Step 2: `PreVisitReportPanel`**

- Loading / not completed states  
- Structured fields + `notable_flags`  
- Collapsible transcript via `usePrevisitMessages`  
- Button «پر کردن پیش‌نویس SOAP (Subjective)» → calls parent callback; if subjective already non-empty, `window.confirm` before overwrite

- [ ] **Step 3: Insert accordion item `previsit` above triage in `ehr/page.tsx`**

Lift or prop-drill draft into `SoapNotesForm` (add optional `initialSubjective` / controlled inject).

- [ ] **Step 4: Manual doctor path from queue → EHR with appointment query**

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/doctor/patients/
git commit -m "$(cat <<'EOF'
feat(frontend): show previsit report to doctors and fill SOAP draft

EOF
)"
```

---

### Task 9: Docs + compose smoke notes

**Files:**
- Modify: `AI/README.md` — run/wire instructions (port 8090, Go env)
- Modify: `docs/DOCUMENTATION.md` — short previsit section + API table (keep concise)
- Optional: `BackEnd/docker-compose.yml` AI service stub if compose already multi-service — only if low-cost; otherwise document manual run

- [ ] **Step 1: README mirror AMLAK wire section**

- [ ] **Step 2: DOCUMENTATION snippet for previsit**

- [ ] **Step 3: Commit**

```bash
git add AI/README.md docs/DOCUMENTATION.md
git commit -m "$(cat <<'EOF'
docs: document previsit AI sidecar and Clinick integration

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Hybrid chat after booking | 2, 5, 7 |
| Intake + flags, no diagnosis | 2 prompts + Global Constraints |
| Report + on-demand transcript | 3–5, 8 |
| Soft reminders, non-blocking | 5 notification + booking |
| EHR draft button, no auto-save | 8 |
| Separate `AI/` + AvalAI AMLAK pattern | 1–2, 4 |
| Go system of record / Front→Go only | 3–7 |
| Leave `TriageNote` alone | 8 places panel nearby |
| Expire on cancel | 5 |
| Stateless AI messages from Go | 4 |

No TBD placeholders in task steps. Open points from spec resolved in Global Constraints (question list, draft mapping, reminder timing preference, stateless default).
