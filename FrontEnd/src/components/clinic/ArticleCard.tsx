import Link from "next/link";
import { Clock } from "lucide-react";

import type { Article } from "@/lib/content";
import { cn, toPersianDigits } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.slug}`} className="block h-full">
      <Card
        className={cn(
          "h-full gap-0 py-0 transition-colors hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        )}
      >
        {/* Cover placeholder (gradient) until real imagery lands. */}
        <div
          aria-hidden="true"
          className="aspect-[16/9] w-full bg-gradient-to-br from-brand-mint to-brand-cyan/40"
        />
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-meta font-medium text-brand">
            {article.category}
          </span>
          <h3 className="text-title-lg font-bold leading-snug group-hover:text-brand">
            {article.title}
          </h3>
          <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
            {article.excerpt}
          </p>
          <span className="flex items-center gap-1 pt-1 text-meta text-muted-foreground tabular-nums">
            <Clock className="size-3.5" aria-hidden="true" />
            {toPersianDigits(article.readingMinutes.toString())} دقیقه مطالعه
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ArticleGrid({ articles }: { articles: Article[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((a) => (
        <ArticleCard key={a.slug} article={a} />
      ))}
    </div>
  );
}
