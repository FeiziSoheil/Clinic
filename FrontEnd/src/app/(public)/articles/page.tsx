import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";

import { listPublicArticles } from "@/cms/services/article-api";
import { toPersianDigits } from "@/lib/utils";

export const metadata: Metadata = {
  title: "مقالات سلامت | Clinick",
  description: "مطالب آموزشی و راهنماهای سلامت به زبان ساده",
  alternates: { canonical: "/articles" },
};

export default async function ArticlesIndexPage() {
  const articles = await listPublicArticles();

  return (
    <div className="booking-container py-10 sm:py-14">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-display-lg font-bold tracking-tight">مقالات سلامت</h1>
        <p className="mt-2 text-muted-foreground">
          دانش پزشکی کاربردی برای سبک زندگی سالم‌تر
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/70 bg-muted/30 px-6 py-16 text-center">
          <p className="text-title-lg font-semibold">هنوز مقاله‌ای منتشر نشده</p>
          <p className="mt-2 text-sm text-muted-foreground">
            به‌زودی مطالب آموزشی سلامت در این بخش قرار می‌گیرد.
          </p>
        </div>
      ) : (
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/articles/${article.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:bg-muted/40"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-brand-mint to-brand-cyan/40">
              {article.coverImageUrl ? (
                <Image
                  src={article.coverImageUrl}
                  alt={article.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-meta font-medium text-brand">
                {article.category}
              </span>
              <h2 className="text-title-lg font-bold leading-snug">
                {article.title}
              </h2>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {article.excerpt}
              </p>
              <span className="flex items-center gap-1 pt-1 text-meta text-muted-foreground tabular-nums">
                <Clock className="size-3.5" aria-hidden="true" />
                {toPersianDigits(String(article.readingMinutes))} دقیقه مطالعه
              </span>
            </div>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}
