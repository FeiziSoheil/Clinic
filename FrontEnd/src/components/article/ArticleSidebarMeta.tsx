import { Calendar, Clock, ListTree, Tag, User } from "lucide-react";

import { formatJalali } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/utils";

export interface ArticleSidebarMetaProps {
  category: string;
  authorName: string;
  readingMinutes: number;
  sectionCount: number;
  publishedAt?: string | null;
  updatedAt: string;
  tags: string[];
}

export function ArticleSidebarMeta({
  category,
  authorName,
  readingMinutes,
  sectionCount,
  publishedAt,
  updatedAt,
  tags,
}: ArticleSidebarMetaProps) {
  const displayDate = publishedAt ?? updatedAt;

  return (
    <section
      aria-label="اطلاعات مقاله"
      className="shrink-0 rounded-2xl border border-border/70 bg-card p-4 lg:p-5"
    >
      <p className="mb-3 text-sm font-semibold">اطلاعات مقاله</p>

      <dl className="space-y-2.5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">دسته‌بندی</dt>
          <dd className="text-end font-medium text-brand">{category}</dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <User className="size-3.5 shrink-0" aria-hidden="true" />
            نویسنده
          </dt>
          <dd className="truncate text-end font-medium">{authorName}</dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            زمان مطالعه
          </dt>
          <dd className="tabular-nums font-medium">
            {toPersianDigits(String(readingMinutes))} دقیقه
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <ListTree className="size-3.5 shrink-0" aria-hidden="true" />
            بخش‌ها
          </dt>
          <dd className="tabular-nums font-medium">
            {toPersianDigits(String(sectionCount))}
          </dd>
        </div>

        {displayDate ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              {publishedAt ? "تاریخ انتشار" : "آخرین به‌روزرسانی"}
            </dt>
            <dd className="text-end text-xs font-medium tabular-nums">
              {formatJalali(displayDate)}
            </dd>
          </div>
        ) : null}
      </dl>

      {tags.length > 0 ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag className="size-3.5" aria-hidden="true" />
            برچسب‌ها
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
