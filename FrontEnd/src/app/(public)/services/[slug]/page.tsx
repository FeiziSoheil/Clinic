import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { findService, SERVICES } from "@/lib/content";
import { Icon } from "@/components/marketing/ui/icon";

/** Pre-render the small static service set at build time (SEO + speed). */
export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = findService(slug);
  if (!service) return { title: "خدمت یافت نشد" };
  return {
    title: `${service.title} | خدمات کلینیک`,
    description: service.description,
    alternates: { canonical: `/services/${slug}` },
    openGraph: { title: service.title, description: service.description },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = findService(slug);
  if (!service) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: service.title,
    description: service.description,
    procedureType: service.title,
    url: `/services/${slug}`,
  };

  return (
    <div className="booking-container py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">خانه</Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <Link href="/doctors" className="hover:text-foreground">خدمات</Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <span className="text-foreground">{service.title}</span>
      </nav>

      <div className="flex flex-col gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-mint text-brand">
          <Icon name={service.iconName} className="size-7" />
        </span>
        <h1 className="text-display-lg font-bold tracking-tight">{service.title}</h1>
        <p className="max-w-2xl text-body-lg text-muted-foreground">
          {service.description}
        </p>
        <Link
          href={`/doctors?specialty=${encodeURIComponent(service.title)}`}
          className="mt-2 w-fit rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
        >
          یافتن پزشکان این خدمت
        </Link>
      </div>
    </div>
  );
}
