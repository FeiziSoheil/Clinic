import { apiClient } from "./api";
import type {
  PreVisitMessage,
  PreVisitSession,
  PreVisitTurnResult,
} from "@/types/previsit";

export async function ensurePrevisitSession(
  appointmentId: string,
): Promise<PreVisitSession> {
  const res = await apiClient.post<PreVisitSession>(
    `/v1/previsit/appointments/${appointmentId}/session`,
  );
  return res.data;
}

export async function fetchPrevisitSession(
  appointmentId: string,
): Promise<PreVisitSession> {
  const res = await apiClient.get<PreVisitSession>(
    `/v1/previsit/appointments/${appointmentId}`,
  );
  return res.data;
}

export async function postPrevisitTurn(
  appointmentId: string,
  message: string,
): Promise<PreVisitTurnResult> {
  const res = await apiClient.post<PreVisitTurnResult>(
    `/v1/previsit/appointments/${appointmentId}/turn`,
    { message },
  );
  return res.data;
}

export async function fetchPrevisitMessages(
  appointmentId: string,
): Promise<PreVisitMessage[]> {
  const res = await apiClient.get<PreVisitMessage[]>(
    `/v1/previsit/appointments/${appointmentId}/messages`,
  );
  return res.data;
}
