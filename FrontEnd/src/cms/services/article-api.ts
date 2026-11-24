/**
 * Article CMS API client.
 *
 * Default: live Go backend (`/api/v1/articles` public, `/api/v1/admin/articles`
 * admin). Set `NEXT_PUBLIC_CMS_ARTICLES_MOCK=1` to use the in-memory seed store
 * for offline CMS UI work — mock is never used as a silent fallback when the API
 * is unreachable or returns an empty list.
 */

import axios from "axios";

import { apiClient } from "@/lib/api";

import type {
  Article,
  ArticleInput,
  ArticleListParams,
  ArticleListResult,
  ArticleStatus,
  ArticleSummary,
} from "../types/article";
import { DEFAULT_ARTICLE_SEO } from "../types/seo";
import { EMPTY_DOCUMENT } from "../types/document";
import { estimateReadingMinutes } from "../utils/reading-time";
import { deriveExcerpt } from "../utils/excerpt";
import { ensureHeadingIds } from "../utils/toc";
import { SEED_DOCUMENTS } from "./seed-articles";

/**
 * Prefer the live API. Set `NEXT_PUBLIC_CMS_ARTICLES_MOCK=1` to force the
 * local seed store during UI work without a backend.
 */
export const USE_MOCK =
  process.env.NEXT_PUBLIC_CMS_ARTICLES_MOCK === "1" ||
  process.env.NEXT_PUBLIC_CMS_ARTICLES_MOCK === "true";

const DEFAULT_AUTHOR = {
  id: "author-clinic",
  name: "تیم محتوای کلینیک",
  bio: "محتوای آموزشی سلامت به زبان ساده",
};

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(article: Article): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    category: article.category,
    tags: article.tags,
    status: article.status,
    coverImageUrl: article.coverImage?.url,
    authorName: article.author.name,
    readingMinutes: article.readingMinutes,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
  };
}

function buildSeedArticles(): Article[] {
  const publishedAt = "2025-03-12T10:00:00.000Z";
  const specs: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    category: string;
    tags: string[];
    cover: string;
    publishedAt: string;
  }> = [
    {
      id: "art-heart",
      slug: "heart-health",
      title: "۷ عادت ساده برای سلامت قلب",
      excerpt:
        "تغییرات کوچک در سبک زندگی چطور می‌توانند خطر بیماری‌های قلبی را کاهش دهند.",
      category: "قلب و عروق",
      tags: ["قلب", "سبک زندگی", "پیشگیری"],
      cover: "/Images/۷ عادت ساده برای سلامت قلب.png",
      publishedAt,
    },
    {
      id: "art-child",
      slug: "child-nutrition",
      title: "تغذیهٔ سالم کودکان؛ راهنمای والدین",
      excerpt: "اصول تغذیهٔ متعادل برای رشد سالم کودکان در سنین مختلف.",
      category: "اطفال",
      tags: ["اطفال", "تغذیه", "والدین"],
      cover: "/Images/تغذیه سالم کودکا.webp",
      publishedAt: "2025-02-28T10:00:00.000Z",
    },
    {
      id: "art-skin",
      slug: "skin-care-summer",
      title: "مراقبت از پوست در تابستان",
      excerpt: "چگونه از پوست خود در برابر آفتاب و گرما محافظت کنیم.",
      category: "پوست",
      tags: ["پوست", "آفتاب", "تابستان"],
      cover: "/Images/مراقبت از پوست در تابستان.webp",
      publishedAt: "2025-02-10T10:00:00.000Z",
    },
  ];

  return specs.map((s) => {
    const content = ensureHeadingIds(
      SEED_DOCUMENTS[s.slug] ?? EMPTY_DOCUMENT,
    );
    return {
      id: s.id,
      title: s.title,
      slug: s.slug,
      excerpt: s.excerpt,
      coverImage: {
        url: s.cover,
        alt: s.title,
      },
      category: s.category,
      tags: s.tags,
      author: DEFAULT_AUTHOR,
      status: "PUBLISHED" as ArticleStatus,
      seo: {
        ...DEFAULT_ARTICLE_SEO,
        metaTitle: s.title,
        metaDescription: s.excerpt,
        keywords: s.tags,
      },
      content,
      readingMinutes: estimateReadingMinutes(content),
      publishedAt: s.publishedAt,
      scheduledAt: null,
      createdAt: s.publishedAt,
      updatedAt: s.publishedAt,
    };
  });
}

/** Module-level mock store (browser + server process). */
let mockStore: Article[] | null = null;

function getMockStore(): Article[] {
  if (!mockStore) mockStore = buildSeedArticles();
  return mockStore;
}

function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Map snake_case backend DTO → frontend Article. */
function mapDto(raw: Record<string, unknown>): Article {
  const authorRaw = (raw.author ?? {}) as Record<string, unknown>;
  const coverRaw = raw.cover_image as Record<string, unknown> | null | undefined;
  const seoRaw = (raw.seo ?? {}) as Record<string, unknown>;
  const content = (raw.content ?? EMPTY_DOCUMENT) as Article["content"];

  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    slug: String(raw.slug ?? ""),
    excerpt: String(raw.excerpt ?? ""),
    coverImage: coverRaw
      ? {
          url: String(coverRaw.url ?? ""),
          alt: String(coverRaw.alt ?? ""),
          width: coverRaw.width as number | undefined,
          height: coverRaw.height as number | undefined,
          blurDataURL: coverRaw.blur_data_url as string | undefined,
          caption: coverRaw.caption as string | undefined,
        }
      : null,
    category: String(raw.category ?? ""),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    author: {
      id: String(authorRaw.id ?? "unknown"),
      name: String(authorRaw.name ?? "نویسنده"),
      avatarUrl: authorRaw.avatar_url as string | undefined,
      bio: authorRaw.bio as string | undefined,
    },
    status: (raw.status as ArticleStatus) ?? "DRAFT",
    seo: {
      metaTitle: seoRaw.meta_title as string | undefined,
      metaDescription: seoRaw.meta_description as string | undefined,
      canonicalUrl: seoRaw.canonical_url as string | undefined,
      ogImage: seoRaw.og_image as string | undefined,
      keywords: Array.isArray(seoRaw.keywords)
        ? (seoRaw.keywords as string[])
        : undefined,
      robots: seoRaw.robots as string | undefined,
      twitterCard: seoRaw.twitter_card as Article["seo"]["twitterCard"],
    },
    content,
    readingMinutes: Number(raw.reading_minutes ?? estimateReadingMinutes(content)),
    publishedAt: (raw.published_at as string | null) ?? null,
    scheduledAt: (raw.scheduled_at as string | null) ?? null,
    createdAt: String(raw.created_at ?? nowIso()),
    updatedAt: String(raw.updated_at ?? nowIso()),
  };
}

function toWire(input: ArticleInput): Record<string, unknown> {
  const content = ensureHeadingIds(input.content);
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt?.trim() || deriveExcerpt(content),
    cover_image: input.coverImage
      ? {
          url: input.coverImage.url,
          alt: input.coverImage.alt,
          width: input.coverImage.width,
          height: input.coverImage.height,
          blur_data_url: input.coverImage.blurDataURL,
          caption: input.coverImage.caption,
        }
      : null,
    category: input.category,
    tags: input.tags ?? [],
    author: input.author
      ? {
          id: input.author.id,
          name: input.author.name,
          avatar_url: input.author.avatarUrl,
          bio: input.author.bio,
        }
      : undefined,
    status: input.status ?? "DRAFT",
    seo: {
      meta_title: input.seo?.metaTitle,
      meta_description: input.seo?.metaDescription,
      canonical_url: input.seo?.canonicalUrl,
      og_image: input.seo?.ogImage,
      keywords: input.seo?.keywords,
      robots: input.seo?.robots,
      twitter_card: input.seo?.twitterCard,
    },
    content,
    published_at: input.publishedAt ?? null,
    scheduled_at: input.scheduledAt ?? null,
  };
}

function mapListResult(data: {
  items?: Record<string, unknown>[];
  total?: number;
  page?: number;
  page_size?: number;
}): ArticleListResult {
  // List endpoints return summaries; map through a thin adapter.
  const items = (data.items ?? []).map((raw) => {
    // Summary DTO may lack full content — preserve list fields only.
    if (raw.content) return toSummary(mapDto(raw));
    return {
      id: String(raw.id),
      title: String(raw.title ?? ""),
      slug: String(raw.slug ?? ""),
      excerpt: String(raw.excerpt ?? ""),
      category: String(raw.category ?? ""),
      tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
      status: (raw.status as ArticleStatus) ?? "DRAFT",
      coverImageUrl:
        (raw.cover_image_url as string | undefined) ??
        ((raw.cover_image as { url?: string } | undefined)?.url),
      authorName: String(raw.author_name ?? (raw.author as { name?: string } | undefined)?.name ?? ""),
      readingMinutes: Number(raw.reading_minutes ?? 1),
      publishedAt: (raw.published_at as string | null) ?? null,
      updatedAt: String(raw.updated_at ?? ""),
    } satisfies ArticleSummary;
  });
  return {
    items,
    total: data.total ?? items.length,
    page: data.page ?? 1,
    pageSize: data.page_size ?? 20,
  };
}

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

async function listArticlesMock(
  params: ArticleListParams = {},
): Promise<ArticleListResult> {
  await delay();
  let items = getMockStore().map(toSummary);
  if (params.status) {
    items = items.filter((a) => a.status === params.status);
  }
  if (params.category) {
    items = items.filter((a) => a.category === params.category);
  }
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    items = items.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q),
    );
  }
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

export async function listArticles(
  params: ArticleListParams = {},
): Promise<ArticleListResult> {
  if (USE_MOCK) {
    return listArticlesMock(params);
  }

  const { data } = await apiClient.get<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    page_size: number;
  }>("/v1/admin/articles", {
    params: {
      status: params.status || undefined,
      category: params.category || undefined,
      q: params.q || undefined,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
  return mapListResult(data);
}

export async function listPublicArticles(): Promise<ArticleSummary[]> {
  if (USE_MOCK) {
    const result = await listArticlesMock({ status: "PUBLISHED", pageSize: 100 });
    return result.items;
  }

  const { data } = await apiClient.get<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    page_size: number;
  }>("/v1/articles", {
    params: {
      page: 1,
      page_size: 100,
    },
  });
  return mapListResult(data).items;
}

export async function getArticle(idOrSlug: string): Promise<Article | null> {
  if (USE_MOCK) {
    await delay();
    return (
      getMockStore().find((a) => a.id === idOrSlug || a.slug === idOrSlug) ??
      null
    );
  }

  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      `/v1/admin/articles/${encodeURIComponent(idOrSlug)}`,
    );
    return mapDto(data);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getPublishedArticleBySlug(
  slug: string,
): Promise<Article | null> {
  if (USE_MOCK) {
    const article = await getArticle(slug);
    if (!article) return null;
    if (article.status !== "PUBLISHED" && article.status !== "PREVIEW") {
      return null;
    }
    return article;
  }

  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      `/v1/articles/${encodeURIComponent(slug)}`,
    );
    return mapDto(data);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function createArticle(input: ArticleInput): Promise<Article> {
  if (USE_MOCK) {
    await delay();
    const content = ensureHeadingIds(input.content);
    const stamp = nowIso();
    const article: Article = {
      id: `art-${Math.random().toString(36).slice(2, 10)}`,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt?.trim() || deriveExcerpt(content),
      coverImage: input.coverImage ?? null,
      category: input.category,
      tags: input.tags ?? [],
      author: {
        ...DEFAULT_AUTHOR,
        ...input.author,
        id: input.author?.id ?? DEFAULT_AUTHOR.id,
        name: input.author?.name ?? DEFAULT_AUTHOR.name,
      },
      status: input.status ?? "DRAFT",
      seo: { ...DEFAULT_ARTICLE_SEO, ...input.seo },
      content,
      readingMinutes: estimateReadingMinutes(content),
      publishedAt: input.publishedAt ?? null,
      scheduledAt: input.scheduledAt ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    getMockStore().unshift(article);
    return article;
  }

  const { data } = await apiClient.post<Record<string, unknown>>(
    "/v1/admin/articles",
    toWire(input),
  );
  return mapDto(data);
}

export async function updateArticle(
  id: string,
  input: ArticleInput,
): Promise<Article> {
  if (USE_MOCK) {
    await delay();
    const store = getMockStore();
    const idx = store.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("article not found");
    const content = ensureHeadingIds(input.content);
    const prev = store[idx];
    const next: Article = {
      ...prev,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt?.trim() || deriveExcerpt(content),
      coverImage: input.coverImage ?? null,
      category: input.category,
      tags: input.tags ?? [],
      author: {
        ...prev.author,
        ...input.author,
      },
      status: input.status ?? prev.status,
      seo: { ...prev.seo, ...input.seo },
      content,
      readingMinutes: estimateReadingMinutes(content),
      publishedAt: input.publishedAt ?? prev.publishedAt,
      scheduledAt: input.scheduledAt ?? prev.scheduledAt,
      updatedAt: nowIso(),
    };
    store[idx] = next;
    return next;
  }

  const { data } = await apiClient.put<Record<string, unknown>>(
    `/v1/admin/articles/${encodeURIComponent(id)}`,
    toWire(input),
  );
  return mapDto(data);
}

export async function deleteArticle(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay();
    mockStore = getMockStore().filter((a) => a.id !== id);
    return;
  }

  await apiClient.delete(`/v1/admin/articles/${encodeURIComponent(id)}`);
}

export async function publishArticle(id: string): Promise<Article> {
  const article = await getArticle(id);
  if (!article) throw new Error("article not found");
  return updateArticle(id, {
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    coverImage: article.coverImage,
    category: article.category,
    tags: article.tags,
    author: article.author,
    status: "PUBLISHED",
    seo: article.seo,
    content: article.content,
    publishedAt: article.publishedAt ?? nowIso(),
    scheduledAt: null,
  });
}
