"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";

/**
 * Client-side providers shared across the app.
 *
 * A fresh `QueryClient` is created per-render via `useState` so that data is
 * never shared between requests when running on the server. `ThemeProvider`
 * (next-themes) is mounted here so theme-aware UI resolves against a single
 * source of truth.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
