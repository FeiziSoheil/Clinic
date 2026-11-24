import type { Metadata } from "next";

import { DiscoveryView } from "@/components/discovery/DiscoveryView";
import { IntelligentSearchBar } from "@/components/discovery/IntelligentSearchBar";

export const metadata: Metadata = {
  title: "جستجوی پزشک | کلینیک",
  description:
    "پزشک متخصص موردنظر خود را پیدا کنید، مقایسه کنید و آنلاین نوبت بگیرید.",
  alternates: { canonical: "/doctors" },
  openGraph: {
    title: "جستجوی پزشک | کلینیک",
    description:
      "پزشک متخصص موردنظر خود را پیدا کنید، مقایسه کنید و آنلاین نوبت بگیرید.",
    url: "/doctors",
  },
};

/**
 * JSON-LD for the doctor collection — an `ItemList` of `Physician` entries is
 * emitted at runtime once doctors load; here we declare the collection page.
 */
function doctorsCollectionSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "فهرست پزشکان",
    inLanguage: "fa-IR",
    url: "/doctors",
  };
}

function firstString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const specialty = firstString(sp.specialty);
  const search = firstString(sp.q);
  const sort = firstString(sp.sort);

  return (
    <div className="booking-container py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(doctorsCollectionSchema()),
        }}
      />

      <header className="flex flex-col gap-2 pb-8">
        <p className="text-eyebrow text-brand">کشف پزشک</p>
        <h1 className="text-display-lg font-bold tracking-tight">
          پزشک مناسب خود را پیدا کنید
        </h1>
        <p className="max-w-2xl text-body-lg text-muted-foreground">
          بر اساس تخصص، تجربه و هزینه مقایسه کنید و در کمترین زمان نوبت بگیرید.
        </p>
      </header>

      <div className="pb-8">
        <IntelligentSearchBar
          defaultQuery={search ?? ""}
          defaultSpecialty={specialty ?? ""}
        />
      </div>

      <DiscoveryView specialty={specialty} search={search} sort={sort} />
    </div>
  );
}
