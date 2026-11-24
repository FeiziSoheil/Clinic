export type PreVisitStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "EXPIRED";

export type PreVisitPhase = "STRUCTURED" | "FREE_CHAT" | "FINALIZED";

export interface PreVisitSymptom {
  name?: string;
  duration?: string;
  severity?: string | number;
}

export interface PreVisitReport {
  chief_complaint: string;
  symptoms: PreVisitSymptom[];
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
  patient_id: string;
  doctor_id: string;
  status: PreVisitStatus;
  phase: PreVisitPhase;
  structured_answers: Record<string, string>;
  report: PreVisitReport | null;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PreVisitMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  created_at: string;
}

export interface PreVisitTurnResult {
  session: PreVisitSession;
  assistant_message: string;
  messages?: PreVisitMessage[];
}
