"use client";

/**
 * Patient pre-visit AI chat for one appointment.
 * Route: `/appointments/previsit/[appointmentId]`
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { ArrowRight, Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  previsitKeys,
  useEnsurePrevisitSession,
  usePrevisitSession,
  usePrevisitTurn,
} from "@/hooks/usePrevisit";
import { fetchPrevisitMessages } from "@/lib/previsit-api";
import type { PreVisitMessage } from "@/types/previsit";
import type { AvatarState } from "@/components/chat/HealthAvatar";
import { useQueryClient } from "@tanstack/react-query";

const HealthAvatar = dynamic(() => import("@/components/chat/HealthAvatar"), {
  ssr: false,
  loading: () => (
    <div
      className="mx-auto size-28 animate-pulse rounded-full bg-muted"
      aria-hidden
    />
  ),
});

const STATUS_LABEL: Record<string, string> = {
  PENDING: "شروع نشده",
  IN_PROGRESS: "در حال تکمیل",
  COMPLETED: "تکمیل‌شده",
  EXPIRED: "منقضی",
};

export default function PrevisitChatPage() {
  const params = useParams();
  const appointmentId = String(params?.appointmentId ?? "");
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<PreVisitMessage[]>([]);
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const ensure = useEnsurePrevisitSession();
  const sessionQuery = usePrevisitSession(appointmentId);
  const turn = usePrevisitTurn(appointmentId);

  useEffect(() => {
    if (!appointmentId) return;
    let cancelled = false;

    void (async () => {
      setStarting(true);
      try {
        await ensure.mutateAsync(appointmentId);
        if (cancelled) return;

        const existing = await fetchPrevisitMessages(appointmentId);
        if (cancelled) return;

        if (existing.length > 0) {
          setLocalMessages(existing);
          queryClient.setQueryData(
            previsitKeys.messages(appointmentId),
            existing,
          );
        } else {
          const first = await turn.mutateAsync("");
          if (cancelled) return;
          if (first.messages?.length) {
            setLocalMessages(first.messages);
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error("شروع گفت‌وگوی پیش‌ویزیت ناموفق بود.", {
            description: (err as Error)?.message,
          });
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per appointment id
  }, [appointmentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, sending, starting]);

  const session = sessionQuery.data ?? turn.data?.session;
  const locked = session?.status === "EXPIRED";
  const inputLocked = locked || sending;

  const lastRole = localMessages[localMessages.length - 1]?.role;
  const lastAssistantId = useMemo(() => {
    for (let i = localMessages.length - 1; i >= 0; i -= 1) {
      if (localMessages[i]?.role === "assistant") return localMessages[i]!.id;
    }
    return null;
  }, [localMessages]);

  /** Live 3D avatar only on the pending bubble while generating, else last assistant. */
  const showPendingReply = sending || (starting && localMessages.length === 0);
  const avatar = useMemo(() => {
    if (session?.status === "EXPIRED") {
      return { state: "offline" as AvatarState, speaking: false };
    }
    if (session?.status === "COMPLETED") {
      return { state: "success" as AvatarState, speaking: false };
    }
    if (showPendingReply) {
      return { state: "thinking" as AvatarState, speaking: true };
    }
    if (localMessages.length === 0) {
      return { state: "greeting" as AvatarState, speaking: false };
    }
    if (lastRole === "assistant") {
      return { state: "listening" as AvatarState, speaking: false };
    }
    return { state: "ready" as AvatarState, speaking: false };
  }, [showPendingReply, lastRole, localMessages.length, session?.status]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || sending || locked) return;
    const optimisticId = `local-user-${Date.now()}`;
    setSending(true);
    setInput("");
    setLocalMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      } as PreVisitMessage,
    ]);
    try {
      const res = await turn.mutateAsync(text);
      if (res.messages?.length) {
        setLocalMessages(res.messages);
      }
      if (res.session.status === "COMPLETED") {
        toast.success("گزارش پیش‌ویزیت آماده شد.");
      }
    } catch (err) {
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
      toast.error("ارسال پیام ناموفق بود.", {
        description: (err as Error)?.message,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        // Mobile: fill the gap between top bar and bottom tabs (both z-50).
        "fixed inset-x-0 z-40",
        "top-[calc(3.5rem+env(safe-area-inset-top))]",
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
        "md:relative md:inset-auto md:top-auto md:bottom-auto md:z-auto md:mx-auto md:h-[calc(100dvh-7.5rem)] md:max-w-2xl md:gap-3 md:bg-transparent",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5 md:border-0 md:px-0 md:py-0">
        <Link
          href="/appointments"
          aria-label="بازگشت"
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "size-10 shrink-0 md:size-11",
          )}
        >
          <ArrowRight className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-1">
          <h1 className="truncate text-base font-bold md:text-2xl">
            دستیار پیش‌ویزیت
          </h1>
          <p className="hidden text-sm text-muted-foreground md:line-clamp-2 md:block">
            با دستیار پیش‌ویزیت مثل یک گفت‌وگوی واقعی حرف بزنید. جایگزین پزشک
            نیست و برای اورژانس مناسب نیست.
          </p>
        </div>
        {session ? (
          <Badge variant="secondary" className="ms-auto shrink-0">
            {STATUS_LABEL[session.status] ?? session.status}
          </Badge>
        ) : null}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border ring-0 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:py-0 max-md:gap-0 md:min-h-0">
        <CardHeader className="hidden shrink-0 border-b border-border pb-3 md:block">
          <CardTitle className="text-base">گفت‌وگو</CardTitle>
          <CardDescription>
            طبیعی حرف بزنید؛ دستیار اطلاعات لازم را برای پزشک جمع می‌کند. وقتی
            آماده بودید بنویسید «تمام».
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 max-md:px-3 max-md:pt-3 max-md:pb-2 md:pt-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0">
            {localMessages.map((m) => {
              const isAssistant = m.role === "assistant";
              const showLiveAvatar =
                isAssistant &&
                m.id === lastAssistantId &&
                !showPendingReply;
              return (
                <div
                  key={m.id}
                  className="flex items-end justify-start gap-2"
                >
                  {isAssistant ? (
                    showLiveAvatar ? (
                      <HealthAvatar
                        state={avatar.state}
                        speaking={avatar.speaking}
                        size={36}
                        className="shrink-0"
                      />
                    ) : (
                      <div
                        className="size-9 shrink-0 rounded-full bg-muted"
                        aria-hidden
                      />
                    )
                  ) : null}
                  <div
                    className={cn(
                      "w-fit max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                      isAssistant
                        ? "bg-background text-foreground shadow-sm"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            {showPendingReply ? (
              <div className="flex items-end justify-start gap-2">
                <HealthAvatar
                  state={avatar.state}
                  speaking={avatar.speaking}
                  size={36}
                  className="shrink-0"
                />
                <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {starting && localMessages.length === 0
                    ? "در حال آماده‌سازی…"
                    : "در حال نوشتن…"}
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {session?.status === "COMPLETED" && session.report?.summary_fa ? (
            <div className="max-h-32 shrink-0 overflow-y-auto rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <div className="font-medium">خلاصه برای پزشک</div>
              <p className="mt-1 whitespace-pre-wrap">{session.report.summary_fa}</p>
            </div>
          ) : null}

          <form
            className="shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div
              className={cn(
                "rounded-2xl border border-border bg-background shadow-sm transition-[box-shadow,border-color]",
                "focus-within:border-ring focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/25",
              )}
            >
              <textarea
                className="max-h-36 min-h-[2.75rem] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                placeholder="پیام خود را بنویسید…"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={inputLocked}
                autoFocus
              />
              <div className="flex items-center gap-1.5 px-2 pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
                  disabled={inputLocked || starting}
                  onClick={() => void send("تمام")}
                >
                  <Check className="size-3.5" />
                  اتمام
                </Button>
                <Button
                  type="submit"
                  size="icon-sm"
                  className="ms-auto size-8 rounded-full"
                  disabled={inputLocked || !input.trim()}
                  aria-label="ارسال"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
