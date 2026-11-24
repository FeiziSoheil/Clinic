"use client";

import { UserCog, UserRound } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { loginPath } from "@/lib/login-routes";
import { cn } from "@/lib/utils";

const entries = [
  {
    as: "patient" as const,
    title: "ورود بیمار",
    description: "ورود با شماره موبایل و کد یک‌بار‌مصرف",
    icon: UserRound,
    accent: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
  {
    as: "staff" as const,
    title: "ورود پرسنل",
    description: "ورود مدیر، پزشک و منشی با نام کاربری",
    icon: UserCog,
    accent: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
];

export function LoginChooser({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm font-medium text-muted-foreground">ورود به سامانه</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <Link key={entry.as} href={loginPath(entry.as)} className="block">
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="flex items-start gap-3 p-4">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    entry.accent,
                  )}
                >
                  <entry.icon className="size-4" />
                </span>
                <span className="min-w-0 text-start">
                  <span className="block text-sm font-bold text-foreground">
                    {entry.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {entry.description}
                  </span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
