import type { Metadata } from "next";

import { MarketingHome } from "@/components/marketing/MarketingHome";
import { fetchMarketingContent } from "@/lib/marketing/cms-api";
import { pickLocalized } from "@/lib/marketing/locale";
import {
  buildFaqSchema,
  buildMedicalOrganizationSchema,
  buildPhysicianSchemas,
} from "@/lib/marketing/schema";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://clinick.ir";

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchMarketingContent();
  const title = pickLocalized(content.settings.clinicName);
  const description = pickLocalized(content.settings.tagline);

  return {
    title: `${title} | مراقبت حرفه‌ای`,
    description,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "fa_IR",
      url: siteUrl,
      title,
      description,
      siteName: title,
      images: [{ url: content.hero.imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [content.hero.imageUrl],
    },
    robots: { index: true, follow: true },
  };
}

export default async function HomePage() {
  const content = await fetchMarketingContent();

  const jsonLd = [
    buildMedicalOrganizationSchema(content, siteUrl),
    buildFaqSchema(content),
    ...buildPhysicianSchemas(content),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingHome content={content} />
    </>
  );
}
