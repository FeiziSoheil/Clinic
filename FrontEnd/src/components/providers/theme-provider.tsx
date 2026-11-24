"use client";

/**
 * Theme provider wrapper around `next-themes`.
 *
 * Mounted once high in the tree (root providers) so the app can toggle light/dark
 * while all dashboards inherit the same theme. We default to `system` and disable
 * the hydration flash via `suppressHydrationWarning` on `<html>` in the root layout.
 *
 * React 19 / Next 16 warn when a client component renders a `<script>` tag.
 * `next-themes` injects an inline script to prevent theme FOUC; on the client we
 * mark it as `application/json` so React does not treat it as an executable
 * script (the real anti-FOUC script already ran from the SSR HTML).
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useMemo, type ComponentProps } from "react";

export function ThemeProvider({
  children,
  scriptProps,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  // Client-only: keep SSR script executable for FOUC prevention; mark as a
  // data block on the client so React 19 does not warn (next-themes already
  // sets suppressHydrationWarning on the injected script).
  const clientScriptProps = useMemo(
    () =>
      typeof window === "undefined"
        ? scriptProps
        : { ...scriptProps, type: "application/json" },
    [scriptProps],
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      scriptProps={clientScriptProps}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
