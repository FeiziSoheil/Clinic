"use client";

import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/shared/Sidebar";
import { PanelDrawer } from "@/components/shared/panel/PanelDrawer";
import { PanelTopbar } from "@/components/shared/panel/PanelTopbar";
import {
  PanelDrawerProvider,
  usePanelDrawer,
} from "@/components/shared/panel/panel-drawer-context";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NavItem } from "@/types/nav";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  navItems: NavItem[];
  roleLabel: string;
  title?: string;
  accentIcon?: LucideIcon;
  children: React.ReactNode;
}

/**
 * Floating staff app shell: white canvas with a soft mint wash and emerald→teal
 * glow halos; three separate rounded surfaces (sidebar, topbar, content), plus
 * an optional push panel drawer as a third content column.
 */
export function AppShell(props: AppShellProps) {
  return (
    <PanelDrawerProvider>
      <AppShellInner {...props} />
    </PanelDrawerProvider>
  );
}

function AppShellInner({
  navItems,
  roleLabel,
  title = "Clinick",
  accentIcon,
  children,
}: AppShellProps) {
  const { open } = usePanelDrawer();

  return (
    <div className="relative min-h-svh bg-[color-mix(in_oklch,var(--brand-mint)_5%,white)] dark:bg-[color-mix(in_oklch,var(--brand-emerald)_8%,var(--background))]">
      {/* Emerald → teal gradient halos */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute inset-x-0 top-0 h-[75%]"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% -10%, color-mix(in oklch, var(--brand-emerald) 20%, transparent), color-mix(in oklch, var(--brand) 10%, transparent) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute -start-24 bottom-0 size-[28rem] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--brand-emerald) 22%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute -end-16 top-1/3 size-[22rem] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--brand) 18%, transparent), transparent 70%)",
          }}
        />
      </div>

      <TooltipProvider>
        <SidebarProvider className="relative min-h-svh bg-transparent">
          <Sidebar
            items={navItems}
            title={title}
            roleLabel={roleLabel}
            accentIcon={accentIcon}
          />

          <SidebarInset className="flex min-h-svh flex-1 flex-col bg-transparent p-2 md:p-3">
            <div className="flex min-h-0 flex-1 flex-col gap-2 md:gap-3">
              <div className="shrink-0 overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10">
                <PanelTopbar roleLabel={roleLabel} />
              </div>

              <div
                className={cn(
                  "relative flex min-h-0 flex-1",
                  "transition-[gap] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                  open ? "gap-2 md:gap-3" : "gap-0",
                )}
              >
                <div
                  className={cn(
                    "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10",
                    "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                    open
                      ? "max-md:pointer-events-none max-md:absolute max-md:inset-0 max-md:scale-[0.98] max-md:opacity-0 md:flex"
                      : "opacity-100",
                  )}
                >
                  <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
                    {children}
                  </main>
                </div>
                <PanelDrawer />
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}

export default AppShell;
