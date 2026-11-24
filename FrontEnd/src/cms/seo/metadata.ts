import type { Metadata } from "next";

import type { Article } from "../types/article";

function absoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (path.startsWith("http")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build Next.js Metadata for a public article page. */
export function buildArticleMetadata(
  article: Article,
  siteUrl: string,
): Metadata {
  const title = article.seo.metaTitle?.trim() || article.title;
  const description =
    article.seo.metaDescription?.trim() || article.excerpt || undefined;
  const canonicalPath =
    article.seo.canonicalUrl?.trim() || `/articles/${article.slug}`;
  const ogImage =
    article.seo.ogImage?.trim() ||
    article.coverImage?.url ||
    undefined;
  const robots = article.seo.robots ?? "index,follow";
  const keywords = article.seo.keywords?.length
    ? article.seo.keywords
    : article.tags;

  return {
    title: `${title} | مقالات سلامت`,
    description,
    keywords,
    alternates: { canonical: canonicalPath },
    robots,
    openGraph: {
      type: "article",
      title,
      description,
      url: absoluteUrl(siteUrl, canonicalPath),
      images: ogImage
        ? [{ url: ogImage, alt: article.coverImage?.alt || title }]
        : undefined,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
      authors: [article.author.name],
      tags: article.tags,
      locale: "fa_IR",
    },
    twitter: {
      card: article.seo.twitterCard ?? "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
