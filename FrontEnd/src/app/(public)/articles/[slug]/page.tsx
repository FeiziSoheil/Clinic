import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock } from "lucide-react";

import { ArticleRenderer } from "@/cms/renderer";
import {
  buildArticleJsonLd,
  buildArticleMetadata,
  stringifyJsonLd,
} from "@/cms/seo";
import { getPublishedArticleBySlug, listPublicArticles } from "@/cms/services/article-api";
import { ensureHeadingIds } from "@/cms/utils/toc";
import { buildToc } from "@/cms/utils/toc";
import { ArticleSidebar } from "@/components/article/ArticleSidebar";
import { toPersianDigits } from "@/lib/utils";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateStaticParams() {
  try {
    const items = await listPublicArticles();
    return items.map((a) => ({ slug: a.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return { title: "مقاله یافت نشد" };
  return buildArticleMetadata(article, SITE_URL);
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) notFound();

  const content = ensureHeadingIds(article.content);
  const toc = buildToc(content);
  const jsonLd = buildArticleJsonLd(article, SITE_URL, {
    name: "Clinick",
    url: SITE_URL,
  });

  return (
    <div className="booking-container py-10 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }}
      />

      <nav
        aria-label="مسیر"
        className="mb-6 flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/" className="hover:text-foreground">
          خانه
        </Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <Link href="/articles" className="hover:text-foreground">
          مقالات
        </Link>
        <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        <span className="text-foreground">{article.title}</span>
      </nav>

      <div className="grid w-full gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,22rem)] xl:grid-cols-[minmax(0,42rem)_1fr] 2xl:grid-cols-[minmax(0,48rem)_1fr]">
        <article className="min-w-0">
          <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-meta font-medium text-brand">
            {article.category}
          </span>
          <h1 className="mt-3 text-display-lg font-bold tracking-tight">
            {article.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="size-3.5" aria-hidden="true" />
              {toPersianDigits(String(article.readingMinutes))} دقیقه مطالعه
            </span>
            <span>{article.author.name}</span>
          </p>

          {article.coverImage?.url ? (
            <div className="relative my-6 aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <Image
                src={article.coverImage.url}
                alt={article.coverImage.alt || article.title}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 720px"
                placeholder={
                  article.coverImage.blurDataURL ? "blur" : "empty"
                }
                blurDataURL={article.coverImage.blurDataURL}
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="my-6 aspect-[16/9] w-full rounded-2xl bg-gradient-to-br from-brand-mint to-brand-cyan/40"
            />
          )}

          {article.excerpt ? (
            <p className="mb-6 text-body-lg leading-relaxed text-muted-foreground">
              {article.excerpt}
            </p>
          ) : null}

          <ArticleRenderer content={content} />
        </article>

        <ArticleSidebar
          items={toc}
          category={article.category}
          authorName={article.author.name}
          readingMinutes={article.readingMinutes}
          sectionCount={toc.length}
          publishedAt={article.publishedAt}
          updatedAt={article.updatedAt}
          tags={article.tags}
        />
      </div>
    </div>
  );
}
