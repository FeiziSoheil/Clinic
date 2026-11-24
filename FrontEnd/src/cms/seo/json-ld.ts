import type { Article } from "../types/article";

function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (path.startsWith("http")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface OrganizationSeoContext {
  name: string;
  url: string;
  logoUrl?: string;
}

/** Schema.org Article + BreadcrumbList + Person + Organization JSON-LD graph. */
export function buildArticleJsonLd(
  article: Article,
  siteUrl: string,
  organization?: OrganizationSeoContext,
) {
  const url = absoluteUrl(siteUrl, `/articles/${article.slug}`);
  const org = organization ?? {
    name: "Clinick",
    url: siteUrl,
  };

  const articleNode = {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: article.seo.metaTitle || article.title,
    description: article.seo.metaDescription || article.excerpt,
    image: article.coverImage?.url
      ? [article.coverImage.url]
      : undefined,
    datePublished: article.publishedAt ?? article.createdAt,
    dateModified: article.updatedAt,
    inLanguage: "fa-IR",
    articleSection: article.category,
    keywords: article.tags.join(", "),
    author: {
      "@type": "Person",
      name: article.author.name,
      ...(article.author.avatarUrl
        ? { image: article.author.avatarUrl }
        : {}),
      ...(article.author.bio ? { description: article.author.bio } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: org.name,
      url: org.url,
      ...(org.logoUrl
        ? { logo: { "@type": "ImageObject", url: org.logoUrl } }
        : {}),
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    wordCount: undefined as number | undefined,
    timeRequired: `PT${article.readingMinutes}M`,
  };

  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "خانه",
        item: absoluteUrl(siteUrl, "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "مقالات",
        item: absoluteUrl(siteUrl, "/articles"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: article.title,
        item: url,
      },
    ],
  };

  return {
    "@context": "https://schema.org",
    "@graph": [articleNode, breadcrumb],
  };
}

/** Serialize JSON-LD for a `<script type="application/ld+json">` tag. */
export function stringifyJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
