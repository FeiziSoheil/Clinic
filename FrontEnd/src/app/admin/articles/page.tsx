"use client";

import Link from "next/link";
import { FilePlus2, Loader2, Newspaper, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PanelPageHeader } from "@/components/shared/panel/PanelKit";
import {
  ARTICLE_STATUS_LABEL,
  ARTICLE_STATUSES,
} from "@/cms/constants";
import { useArticles, useDeleteArticle } from "@/cms/hooks/useArticles";
import type { ArticleStatus } from "@/cms/types/article";
import { formatJalaliLabel } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/utils";
import { useState } from "react";

const ALL = "__all__";

function statusVariant(status: ArticleStatus) {
  switch (status) {
    case "PUBLISHED":
      return "default" as const;
    case "DRAFT":
    case "PREVIEW":
    case "REVISION":
      return "secondary" as const;
    case "SCHEDULED":
    case "PRIVATE":
      return "outline" as const;
    case "ARCHIVED":
      return "destructive" as const;
  }
}

export default function AdminArticlesPage() {
  const [status, setStatus] = useState(ALL);
  const { data, isLoading, isError } = useArticles({
    status: status === ALL ? "" : (status as ArticleStatus),
  });
  const remove = useDeleteArticle();
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title="مقالات"
        subtitle="مدیریت محتوای آموزشی کلینیک (CMS)"
        icon={Newspaper}
        actions={
          <Link href="/admin/articles/new" className={buttonVariants()}>
            <FilePlus2 className="size-4" />
            مقاله جدید
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:max-w-xs">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه وضعیت‌ها</SelectItem>
            {ARTICLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ARTICLE_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-destructive">
              خطا در دریافت مقالات
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              مقاله‌ای یافت نشد. اولین مقاله را بسازید.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>دسته</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>مطالعه</TableHead>
                  <TableHead>به‌روزرسانی</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium">{article.title}</p>
                        <p className="truncate text-xs text-muted-foreground dir-ltr">
                          /articles/{article.slug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{article.category}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(article.status)}>
                        {ARTICLE_STATUS_LABEL[article.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {toPersianDigits(String(article.readingMinutes))} دقیقه
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatJalaliLabel(article.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/admin/articles/${article.id}/edit`}
                          className={buttonVariants({
                            size: "icon-sm",
                            variant: "ghost",
                          })}
                          aria-label="ویرایش"
                        >
                          <Pencil className="size-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="حذف"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (
                              typeof window !== "undefined" &&
                              window.confirm("مقاله حذف شود؟")
                            ) {
                              void remove.mutateAsync(article.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
