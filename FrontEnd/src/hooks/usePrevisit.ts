"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ensurePrevisitSession,
  fetchPrevisitMessages,
  fetchPrevisitSession,
  postPrevisitTurn,
} from "@/lib/previsit-api";

export const previsitKeys = {
  all: ["previsit"] as const,
  session: (appointmentId: string) =>
    [...previsitKeys.all, "session", appointmentId] as const,
  messages: (appointmentId: string) =>
    [...previsitKeys.all, "messages", appointmentId] as const,
};

export function usePrevisitSession(appointmentId: string | undefined) {
  return useQuery({
    queryKey: previsitKeys.session(appointmentId ?? ""),
    queryFn: () => fetchPrevisitSession(appointmentId as string),
    enabled: Boolean(appointmentId),
    retry: false,
  });
}

export function useEnsurePrevisitSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) => ensurePrevisitSession(appointmentId),
    onSuccess: (data) => {
      void qc.setQueryData(previsitKeys.session(data.appointment_id), data);
    },
  });
}

export function usePrevisitTurn(appointmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => postPrevisitTurn(appointmentId, message),
    onSuccess: (data) => {
      void qc.setQueryData(previsitKeys.session(appointmentId), data.session);
      if (data.messages) {
        void qc.setQueryData(previsitKeys.messages(appointmentId), data.messages);
      } else {
        void qc.invalidateQueries({
          queryKey: previsitKeys.messages(appointmentId),
        });
      }
    },
  });
}

export function usePrevisitMessages(
  appointmentId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: previsitKeys.messages(appointmentId ?? ""),
    queryFn: () => fetchPrevisitMessages(appointmentId as string),
    enabled: Boolean(appointmentId) && enabled,
  });
}
