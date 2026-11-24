/**
 * Per-article SEO fields. Used by Next.js `generateMetadata` and JSON-LD
 * builders. Kept separate from the body document so SEO tooling / AI assistants
 * can mutate meta without touching ProseMirror JSON.
 */

export interface ArticleSeo {
  /** Browser / SERP title. Falls back to article title when empty. */
  metaTitle?: string;
  /** SERP description. Falls back to excerpt when empty. */
  metaDescription?: string;
  /** Absolute or site-relative canonical URL path. */
  canonicalUrl?: string;
  /** Open Graph image override (defaults to cover). */
  ogImage?: string;
  /** Comma-separated or list keywords for meta keywords. */
  keywords?: string[];
  /** robots directive, e.g. "index,follow" or "noindex,nofollow". */
  robots?: string;
  /** Twitter card type. */
  twitterCard?: "summary" | "summary_large_image";
}

export const DEFAULT_ARTICLE_SEO: ArticleSeo = {
  robots: "index,follow",
  twitterCard: "summary_large_image",
};
