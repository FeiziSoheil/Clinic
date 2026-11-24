"use client";

/**
 * ============================================================================
 * CLINICK — PANEL TOPBAR
 * ============================================================================
 * Topbar chrome for staff AppShell floating cards. Carries the sidebar
 * trigger, active-panel context, search, notifications, and user menu.
 * ============================================================================
 */

import { Bell, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { UserMenu } from "@/components/shared/UserMenu";

export function PanelTopbar({
  roleLabel,
  showSearch = true,
}: {
  roleLabel?: string;
  /** Toggle the decorative search field. */
  showSearch?: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 px-3 md:h-16 md:px-5">
      <SidebarTrigger className="size-9 rounded-xl hover:bg-muted" />
      <Separator orientation="vertical" className="h-6" />

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="truncate text-sm font-bold text-foreground">
          {roleLabel ?? "پنل"}
        </span>
      </div>

      <div className="ms-auto flex items-center gap-2">
        {showSearch ? (
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
            <Input
              type="search"
              placeholder="جستجو…"
              className="h-10 w-56 rounded-xl bg-muted/60 ltr:pl-9 ltr:pr-3 rtl:pr-9 rtl:pl-3"
            />
          </div>
        ) : null}

        <button
          type="button"
          aria-label="اعلان‌ها"
          className="relative grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" />
          <span className="absolute end-2.5 top-2.5 size-2 rounded-full bg-brand ring-2 ring-card" />
        </button>

        <div className="flex items-center">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export default PanelTopbar;
