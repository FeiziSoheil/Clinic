"use client";

/**
 * ============================================================================
 * CLINICK — INSURANCE LOGO CLOUD (spec §10)
 * ============================================================================
 * Searchable logo cloud of accepted insurance partners. Selecting an insurer
 * routes to discovery with it as an active facet (coverage clarity reduces
 * payment-stage drop-off). Logos are wordmarks until brand assets are supplied.
 * ============================================================================
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import type { InsurancePartner } from "@/lib/content";
import { cn } from "@/lib/utils";

export function InsuranceLogoCloud({
  partners,
}: {
  partners: InsurancePartner[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, partners]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative mx-auto w-full max-w-sm">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بیمه خود را جستجو کنید…"
          aria-label="جستجوی بیمه"
          className="h-11 w-full rounded-xl border border-border bg-card ps-9 pe-3 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          بیمه‌ای یافت نشد. با پذیرش تماس بگیرید.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                onClick={() => router.push(`/doctors?insurance=${encodeURIComponent(p.name)}`)}
                className={cn(
                  "flex h-full w-full flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-start",
                  "transition-all hover:border-brand/40 hover:bg-brand-mint/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                )}
              >
                <span className="font-semibold">{p.name}</span>
                <span className="text-meta text-muted-foreground">
                  {p.coverageNote}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
