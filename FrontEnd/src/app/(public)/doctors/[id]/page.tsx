import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { fetchDoctorById } from "@/lib/doctor-api";
import { DoctorProfileView } from "@/components/doctor/DoctorProfileView";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://clinick.ir";

/** Per-doctor metadata for SEO + social sharing. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let doctor;
  try {
    doctor = await fetchDoctorById(id);
  } catch {
    return { title: "پزشک یافت نشد" };
  }

  const title = `${doctor.full_name} | ${doctor.specialty}`;
  const description =
    doctor.bio ??
    `نوبت‌دهی آنلاین ${doctor.full_name}، متخصص ${doctor.specialty}.`;

  return {
    title,
    description,
    alternates: { canonical: `/doctors/${id}` },
    openGraph: {
      type: "profile",
      locale: "fa_IR",
      url: `/doctors/${id}`,
      title,
      description,
    },
    twitter: { card: "summary", title, description },
  };
}

/** Structured data: Physician + BreadcrumbList for rich results. */
function buildSchema(doctor: Awaited<ReturnType<typeof fetchDoctorById>>) {
  const physician = {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.full_name,
    medicalSpecialty: doctor.specialty,
    description: doctor.bio ?? undefined,
    identifier: doctor.medical_system_number,
    url: `${siteUrl}/doctors/${doctor.id}`,
    ...(typeof doctor.rating === "number"
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: doctor.rating,
            bestRating: 5,
            reviewCount: 1,
          },
        }
      : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "پزشکان",
        item: `${siteUrl}/doctors`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: doctor.full_name,
        item: `${siteUrl}/doctors/${doctor.id}`,
      },
    ],
  };

  return [physician, breadcrumb];
}

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let doctor;
  try {
    doctor = await fetchDoctorById(id);
  } catch {
    notFound();
  }

  const schemas = buildSchema(doctor);

  return (
    <div className="booking-container py-8 sm:py-12">
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {/* Breadcrumb */}
      <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">خانه</Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <Link href="/doctors" className="hover:text-foreground">پزشکان</Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <span className="text-foreground">{doctor.full_name}</span>
      </nav>

      <DoctorProfileView doctor={doctor} />
    </div>
  );
}
