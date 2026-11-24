# Pre-visit AI chat (patient intake → doctor report)

**Date:** 2026-11-15  
**Status:** Approved for planning  
**Scope:** Patient pre-visit conversation after booking; structured report + transcript for the treating doctor; optional EHR draft fill. New `AI/` Python sidecar (AvalAI + LangChain), integrated via Go.

## Problem

Before a visit, clinicians lack a structured patient-prepared summary. Patients either arrive with unstructured complaints or fill heavy forms. Clinick already has booking, notifications, EHR (`MedicalRecord`), and in-clinic `TriageNote`, but nothing that runs an AI intake tied to an appointment and surfaces a doctor-ready brief at visit time.

## Goal

After a patient books an appointment, invite them to a **hybrid pre-visit chat** (fixed questions, then free chat). An AI service produces a **structured report** plus **notable flags** (no diagnosis). The doctor sees the report at visit time, can open the full **transcript**, and may **fill an EHR draft** from the report without auto-writing the official record.

## Decisions

| Topic | Choice |
| --- | --- |
| Audience | Patient of a booked appointment → report for that appointment’s doctor |
| Timing | After booking, before visit (option A) |
| AI role | Intake + notable flags only — no diagnosis or prescribing (option B) |
| Doctor view | Structured report + on-demand full transcript (option B) |
| Obligation | Strongly recommended with reminders; does not block check-in/visit (option B) |
| EHR | Separate from `MedicalRecord`; button to fill draft fields from report (option B) |
| Conversation shape | Hybrid: structured questions → free chat (option C) |
| Architecture | Go = system of record + RBAC; `AI/` = LangChain brain; Front talks only to Go |
| LLM provider | AvalAI (`https://api.avalai.ir/v1`), pattern from AMLAK `AI/` sidecar |
| Layout | Third root folder `Clinick/AI/` alongside `BackEnd/` and `FrontEnd/` |
| Relation to `TriageNote` | Unchanged; AI report is complementary, shown near triage in doctor UI |

## Non-goals (v1)

- Clinical diagnosis, automated emergency triage actions, or prescribing
- Chat without an appointment
- Auto-persisting AI output into `MedicalRecord` without doctor confirmation
- Voice, lab image upload, or replacing `TriageNote`
- Holding `AVALAI_API_KEY` in Go or FrontEnd

## Architecture

```
FrontEnd (Next.js)
    │  JWT
    ▼
BackEnd (Go)  ── owns PreVisitSession, messages, final report, notifications, EHR draft apply
    │  AI_SERVICE_URL (internal)
    ▼
AI/ (FastAPI + LangChain + AvalAI)
    │  AVALAI_API_KEY only here
    ▼
AvalAI OpenAI-compatible API
```

Mirror AMLAK: Go never stores the AvalAI key; on AI failure the appointment/visit still works.

## Data model (Go / Mongo — source of truth)

### PreVisitSession

One active session per appointment.

| Field | Notes |
| --- | --- |
| `id` | ObjectId |
| `appointment_id` | Required; unique among non-EXPIRED sessions |
| `patient_id`, `doctor_id` | Denormalized from appointment |
| `status` | `PENDING` \| `IN_PROGRESS` \| `COMPLETED` \| `EXPIRED` |
| `phase` | `STRUCTURED` \| `FREE_CHAT` \| `FINALIZED` |
| `structured_answers` | Map/object from fixed questions |
| `report` | Embedded `PreVisitReport` or null until completed |
| `completed_at`, `created_at`, `updated_at` | |

### PreVisitMessage

| Field | Notes |
| --- | --- |
| `session_id` | |
| `role` | `user` \| `assistant` \| `system` |
| `content` | Text |
| `created_at` | |

The ordered list of messages is the **transcript** (full chat history). Doctors load it only when they open “view full conversation.”

### PreVisitReport (embedded)

| Field | Notes |
| --- | --- |
| `chief_complaint` | |
| `symptoms` | List: name, duration, severity as applicable |
| `medications`, `allergies`, `relevant_history` | |
| `notable_flags` | Doctor attention items — not diagnoses |
| `summary_fa` | Short Persian narrative |
| `model`, `engine` | e.g. AvalAI model name, `langchain_avalai` |

`TriageNote` and `MedicalRecord` schemas stay as-is.

## Patient flow

1. Patient books appointment → Go creates `PreVisitSession` (`PENDING`).
2. Notification/reminder invites chat (non-blocking).
3. Patient opens chat for that appointment → `IN_PROGRESS`, `phase=STRUCTURED`.
4. Fixed questions collected into `structured_answers`.
5. `phase=FREE_CHAT`: free text + clarifying questions from AI.
6. Patient finishes or AI returns `phase=FINALIZED` → Go persists any `report` from the turn, or calls `POST /v1/previsit/finalize` if report is still null → then sets `status=COMPLETED` and `phase=FINALIZED`.
7. Until visit time, patient may re-enter and revise; report is overwritten on re-finalize (`COMPLETED` stays until appointment expires/cancels).
8. Cancelled/expired appointment → session `EXPIRED`; no new turns.

Only the appointment’s patient may chat. Prompts forbid diagnosis and treatment advice.

## Doctor flow

1. On visit/patient UI, near existing triage accordion: **AI pre-visit report** card.
2. If not `COMPLETED`: show status (“not started” / “in progress”).
3. If `COMPLETED`: show structured report fields + flags + `summary_fa`.
4. Optional control: open full transcript.
5. Button **Fill EHR draft from report**: maps report fields (e.g. symptoms / chief complaint) into the medical-record form only. Doctor edits and saves. If form already has content, confirm overwrite of draft fields.
6. Access: treating doctor for that appointment (and admin per existing RBAC). Patient does not see the doctor-oriented flags view.

## Public API (Front ↔ Go)

Illustrative; exact paths follow existing Echo grouping.

| Actor | Capability |
| --- | --- |
| Patient | Start/continue turn on `appointment_id`; get own session status |
| Doctor | Get report for appointment; get transcript; apply-to-EHR-draft |

Front never calls the Python service directly.

## Internal API (Go ↔ AI)

### `GET /health`

Liveness + whether AvalAI is configured (same idea as AMLAK).

### `POST /v1/previsit/turn`

Request:

```json
{
  "session_id": "...",
  "phase": "STRUCTURED|FREE_CHAT",
  "structured_answers": {},
  "messages": [{ "role": "user|assistant", "content": "..." }],
  "patient_message": "...",
  "locale": "fa"
}
```

Response:

```json
{
  "assistant_message": "...",
  "phase": "STRUCTURED|FREE_CHAT|FINALIZED",
  "structured_answers": {},
  "report": null,
  "model": "deepseek-chat",
  "engine": "langchain_avalai"
}
```

### `POST /v1/previsit/finalize`

Builds/refreshes `PreVisitReport` from messages + structured answers. On invalid/partial LLM JSON, Go keeps session `IN_PROGRESS` and surfaces a retryable error.

Go config (like AMLAK):

```env
AI_SERVICE_URL=http://127.0.0.1:8090
PREVISIT_AI_ENABLED=true
PREVISIT_AI_TIMEOUT=30s
```

## AI service layout

```
AI/
  app/
    main.py
    settings.py          # AVALAI_* (AMLAK-compatible)
    schemas.py
    previsit/
      graph.py           # STRUCTURED → FREE_CHAT → FINALIZED
      prompts.py         # FA prompts; no diagnosis/prescribe
      structured.py
      report.py
    llm/
      avalai.py          # OpenAI-compatible client + model fallback chain
  tests/
  .env.example
  requirements.txt
  README.md
```

### AvalAI settings (from AMLAK)

- `AVALAI_API_KEY` — AI only  
- `AVALAI_BASE_URL=https://api.avalai.ir/v1`  
- `AVALAI_CHAT_MODEL` + `AVALAI_CHAT_FALLBACK_MODELS`  
- `AI_HOST` / `AI_PORT` (default `8090`)  

LangChain orchestrates interview state and structured report output; model calls go through AvalAI. No tools that mutate booking or EHR.

Reference implementation pattern: `/home/soheil/My/NextJs/AMLAK/AI`.

## Errors

| Case | Behavior |
| --- | --- |
| AI down / timeout | Patient sees retryable error; appointment/visit unaffected |
| AvalAI unconfigured / billing | Health reflects it; turn fails clearly |
| Appointment cancelled | Session `EXPIRED` |
| Bad finalize JSON | Stay `IN_PROGRESS`; allow retry |

## Security

- JWT + RBAC on all Front→Go previsit routes  
- AI reachable only on internal network from Go  
- Minimize PHI in AI logs; never log API keys  
- Prompt policy: collect and flag only — no diagnosis, no prescriptions, no definitive treatment advice  

## Reuse of existing Clinick pieces

| Existing | Role |
| --- | --- |
| Booking / appointment | Session anchor; create session on book; expire on cancel |
| Notification | Soft reminders to complete pre-visit chat |
| Auth JWT / RBAC | Patient chat + doctor report access |
| EHR `MedicalRecord` | Draft fill target only |
| EHR `TriageNote` + doctor triage UI | Unchanged; place AI report card nearby |
| AMLAK `AI/` pattern | Sidecar layout, AvalAI env, Go `AI_SERVICE_URL` |

## Success criteria

1. After booking, patient can complete hybrid chat for that appointment.  
2. Completed session yields structured report + stored transcript.  
3. Doctor sees report at visit; can open transcript; can fill EHR draft without auto-save.  
4. Visit works even if chat never completed or AI is down.  
5. `AVALAI_API_KEY` exists only under `AI/`.  

## Open points for implementation plan (not blockers)

- Exact fixed question list and severity scale UX  
- Reminder schedule (how many / when relative to appointment time)  
- Precise EHR field mapping (legacy symptoms vs SOAP fields) for draft fill  
- Whether message history for LLM is always sent fully by Go (stateless AI) or AI keeps short-lived cache — default: **stateless**; Go sends `messages` each turn  
