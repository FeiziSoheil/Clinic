import type { ReactNode } from "react";

/**
 * Layout for the `(auth)` route group.
 *
 * Renders its children (login / register pages) full-screen and vertically
 * centered over a subtle neutral gradient. It is a Server Component on purpose
 * — the interactive logic lives inside each page (`"use client"`).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Decorative blurred accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      {/* Brand mark */}
      <header className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <span className="text-lg font-bold">C</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Clinick</h1>
        <p className="text-sm text-muted-foreground">
          سامانهٔ پیشرفتهٔ نوبت‌دهی کلینیک
        </p>
      </header>

      {/* Page content */}
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
