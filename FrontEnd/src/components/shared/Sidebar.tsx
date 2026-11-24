"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  LogOut,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { fullName, type UserRole } from "@/types/auth";
import type { NavItem } from "@/types/nav";

interface SidebarProps {
  /** Navigation entries to render in the sidebar. */
  items: NavItem[];
  /** Brand/app name shown at the top of the sidebar. */
  title?: string;
  /** Which edge the sidebar is pinned to (defaults to the right for RTL). */
  side?: "left" | "right";
  /** Small label under the brand (e.g. the active panel). */
  roleLabel?: string;
  /** Logo mark icon (defaults to a stethoscope). */
  accentIcon?: LucideIcon;
}

const ROLE_LABELS: Record<UserRole, string> = {
  DOCTOR: "پزشک",
  RECEPTIONIST: "پذیرش",
  ADMIN: "مدیر",
  PATIENT: "بیمار",
};

/** Deterministic gradient for the user avatar monogram. */
function gradientFor(name: string): string {
  const palettes = [
    "from-brand to-[var(--gradient-mid)]",
    "from-sky-500 to-brand",
    "from-[var(--gold)] to-amber-500",
    "from-emerald-500 to-brand",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

/**
 * Staff panel sidebar composed from shadcn/ui Sidebar primitives
 * (`floating` + `collapsible="icon"`) with tooltips and a user footer menu.
 */
export function Sidebar({
  items,
  title = "Clinick",
  side = "right",
  roleLabel,
  accentIcon: Accent = Stethoscope,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const name = user ? fullName(user) || user.phone : "";
  const role = user ? ROLE_LABELS[user.role] : undefined;
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] ?? "")
        .join("")
    : "";

  const handleLogout = () => {
    useAuthStore.getState().logout();
    router.replace("/login");
  };

  return (
    <SidebarRoot side={side} variant="floating" collapsible="icon" dir="rtl">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={title}
              className="pointer-events-none"
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Accent className="size-4" />
              </span>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{title}</span>
                {roleLabel ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {roleLabel}
                  </span>
                ) : null}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ناوبری</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" />}
              >
                <span
                  className={cn(
                    "flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white",
                    gradientFor(name),
                  )}
                >
                  {initials || "?"}
                </span>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  {role ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {role}
                    </span>
                  ) : null}
                </div>
                <ChevronsUpDown className="ms-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                    <span
                      className={cn(
                        "flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white",
                        gradientFor(name),
                      )}
                    >
                      {initials || "?"}
                    </span>
                    <div className="grid flex-1 text-sm leading-tight">
                      <span className="truncate font-semibold">{name}</span>
                      {role ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {role}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut />
                  خروج از حساب
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  );
}

export default Sidebar;
