/**
 * Enterprise CMS article entity.
 *
 * Status lifecycle supports draft → publish, schedule, private preview, and
 * archival without requiring schema rewrites. Body content is always
 * {@link PMDocument} (ProseMirror JSON).
 */

import type { PMDocument } from "./document";
import type { ArticleSeo } from "./seo";

/** Editorial lifecycle statuses. */
export type ArticleStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "SCHEDULED"
  | "ARCHIVED"
  | "PRIVATE"
  | "PREVIEW"
  | "REVISION";

export interface ArticleAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
}

export interface ArticleCoverImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
  caption?: string;
}

/**
 * Full article record returned by admin and public article APIs.
 * Field names are camelCase on the frontend; the Go backend may snake_case
 * wire format — mappers live in `services/article-api`.
 */
export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage?: ArticleCoverImage | null;
  category: string;
  tags: string[];
  author: ArticleAuthor;
  status: ArticleStatus;
  seo: ArticleSeo;
  /** ProseMirror JSON body — never HTML. */
  content: PMDocument;
  readingMinutes: number;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating / updating an article from the admin editor. */
export interface ArticleInput {
  title: string;
  slug: string;
  excerpt?: string;
  coverImage?: ArticleCoverImage | null;
  category: string;
  tags?: string[];
  author?: Partial<ArticleAuthor>;
  status?: ArticleStatus;
  seo?: ArticleSeo;
  content: PMDocument;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

/** Lightweight list row for admin tables and public index cards. */
export interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  coverImageUrl?: string;
  authorName: string;
  readingMinutes: number;
  publishedAt?: string | null;
  updatedAt: string;
}

export interface ArticleListParams {
  status?: ArticleStatus | "";
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ArticleListResult {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}
