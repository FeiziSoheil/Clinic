"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Soft ease — calmer open/close, gentle settle (no bounce). */
const EASE =
  "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

export function PanelDrawer({ className }: { className?: string }) {
  const { open, title, description, content, closeDrawer } = usePanelDrawer();
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Keep mounted through the exit animation so close can slide out.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Adjust presence during render (React-recommended) so enter/exit can animate.
  if (open && !mounted) {
    setMounted(true);
  }
  if (!open && visible) {
    setVisible(false);
  }

  // After mount, flip to visible on the next frames so the CSS transition runs.
  useEffect(() => {
    if (!open || !mounted || visible) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, mounted, visible]);

  useEffect(() => {
    if (!visible) return;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [visible, closeDrawer]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        // Outer: preferred flex size + clip via max-width (no min-width — that
        // would fight max-w-0 on close).
        "min-h-0 w-[min(100%,35rem)] shrink-0 overflow-hidden",
        "transition-[max-width,opacity] motion-reduce:transition-none",
        EASE,
        visible
          ? "max-w-[min(100%,35rem)] opacity-100"
          : "pointer-events-none max-w-0 opacity-0",
      )}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (
          e.propertyName !== "max-width" &&
          e.propertyName !== "opacity"
        ) {
          return;
        }
        if (!open) setMounted(false);
      }}
    >
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-hidden={!visible}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-state={visible ? "open" : "closed"}
        className={cn(
          // Inner keeps a stable ~560px panel so forms (2-col) fit; outer clips.
          "flex h-full min-h-0 w-[min(100%,35rem)] flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10 outline-none",
          "transition-[transform,opacity] motion-reduce:transition-none motion-reduce:translate-x-0",
          EASE,
          visible
            ? "translate-x-0 opacity-100"
            : "opacity-0 ltr:translate-x-6 rtl:-translate-x-6",
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold leading-none">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="بستن"
            onClick={closeDrawer}
          >
            <X />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{content}</div>
      </aside>
    </div>
  );
}
