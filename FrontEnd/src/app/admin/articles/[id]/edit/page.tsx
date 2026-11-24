"use client";

import { ArticleEditorPage } from "@/cms/editor/ArticleEditorPage";
import { useArticle } from "@/cms/hooks/useArticles";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";

/** Canonical edit URL: `/admin/articles/[id]/edit`. */
export default function EditArticleByPathPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, isError } = useArticle(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        در حال بارگذاری مقاله…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-20 text-center text-sm text-destructive">
        مقاله یافت نشد
      </div>
    );
  }

  return <ArticleEditorPage mode="edit" article={data} />;
}
