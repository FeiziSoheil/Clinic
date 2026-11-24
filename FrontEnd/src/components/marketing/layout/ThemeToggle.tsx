"use client";

/**
 * ============================================================================
 * CLINICK — THEME TOGGLE
 * ============================================================================
 * Accessible light/dark switch backed by next-themes. To avoid the SSR
 * hydration flash we must not render theme-dependent UI until the client has
 * mounted. Rather than calling setState inside an effect (which the project's
 * react-hooks rule forbids), we read a "mounted" boolean via
 * `useSyncExternalStore` — `false` on the server + first client paint (matching
 * the SSR markup), then `true` afterwards with no cascading render.
 * ============================================================================
 */

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  // Keep aria attrs + icon on the light-mode defaults until after hydration so
  // SSR markup matches the client's first paint (resolvedTheme can already be
  // "dark" from localStorage on the client while the server used defaultTheme).
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تاریک"}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      data-cursor="hover"
      className={cn(
        "grid size-10 place-items-center rounded-full border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-[18px]" />
        ) : (
          <Moon className="size-[18px]" />
        )
      ) : (
        <span className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}
