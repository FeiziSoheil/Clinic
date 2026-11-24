"use client";

/**
 * Admin article create/edit form — metadata + TipTap body + SEO panel.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassPanel, PanelPageHeader } from "@/components/shared/panel/PanelKit";
import { ArticleEditor } from "@/cms/editor";
import { ARTICLE_STATUS_LABEL, ARTICLE_STATUSES } from "@/cms/constants";
import { useAutosave } from "@/cms/hooks/useAutosave";
import { useReadingTime, useToc } from "@/cms/hooks/useDocumentMeta";
import {
  useCreateArticle,
  useAutosaveArticle,
  useUpdateArticle,
} from "@/cms/hooks/useArticles";
import { getAiService } from "@/cms/services/ai-service";
import { getRevisionService } from "@/cms/services/revision-service";
import { slugify } from "@/cms/utils/slug";
import { deriveExcerpt } from "@/cms/utils/excerpt";
import { EMPTY_DOCUMENT, type PMDocument } from "@/cms/types/document";
import type { Article, ArticleInput, ArticleStatus } from "@/cms/types/article";
import { DEFAULT_ARTICLE_SEO } from "@/cms/types/seo";
import { toPersianDigits } from "@/lib/utils";
import { MediaSourceField } from "@/cms/editor/components/MediaSourceField";

export function ArticleEditorPage({
  article,
  mode,
}: {
  article?: Article | null;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const create = useCreateArticle();
  const update = useUpdateArticle(article?.id ?? "");
  const autosave = useAutosaveArticle(article?.id ?? "");

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(article?.slug));
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [category, setCategory] = useState(article?.category ?? "");
  const [tags, setTags] = useState((article?.tags ?? []).join(", "));
  const [status, setStatus] = useState<ArticleStatus>(
    article?.status ?? "DRAFT",
  );
  const [coverUrl, setCoverUrl] = useState(article?.coverImage?.url ?? "");
  const [coverAlt, setCoverAlt] = useState(article?.coverImage?.alt ?? "");
  const [content, setContent] = useState<PMDocument>(
    article?.content ?? EMPTY_DOCUMENT,
  );
  const [metaTitle, setMetaTitle] = useState(article?.seo.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    article?.seo.metaDescription ?? "",
  );
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!slugTouched && title) setSlug(slugify(title));
  }, [title, slugTouched]);

  const readingMinutes = useReadingTime(content);
  const toc = useToc(content);

  const payloadKey = useMemo(
    () =>
      JSON.stringify({
        title,
        slug,
        excerpt,
        category,
        tags,
        status,
        coverUrl,
        content,
        metaTitle,
        metaDescription,
      }),
    [
      title,
      slug,
      excerpt,
      category,
      tags,
      status,
      coverUrl,
      content,
      metaTitle,
      metaDescription,
    ],
  );

  function buildInput(): ArticleInput {
    const tagList = tags
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      title: title.trim() || "بدون عنوان",
      slug: slug.trim() || slugify(title || "article"),
      excerpt: excerpt.trim() || deriveExcerpt(content),
      category: category.trim() || "عمومی",
      tags: tagList,
      status,
      coverImage: coverUrl
        ? { url: coverUrl, alt: coverAlt || title }
        : null,
      seo: {
        ...DEFAULT_ARTICLE_SEO,
        metaTitle: metaTitle || title,
        metaDescription: metaDescription || excerpt || deriveExcerpt(content),
        keywords: tagList,
      },
      content,
      publishedAt:
        status === "PUBLISHED"
          ? article?.publishedAt ?? new Date().toISOString()
          : article?.publishedAt ?? null,
    };
  }

  async function persist(nextStatus?: ArticleStatus) {
    const input = buildInput();
    if (nextStatus) input.status = nextStatus;
    if (mode === "create") {
      const created = await create.mutateAsync(input);
      if (created) {
        await getRevisionService().snapshot(
          created,
          "manual",
          "admin",
          "create",
        );
        router.replace(`/admin/articles/${created.id}/edit`);
      }
      return;
    }
    if (!article) return;
    const updated = await update.mutateAsync(input);
    await getRevisionService().snapshot(
      updated,
      nextStatus === "PUBLISHED" ? "publish" : "manual",
      "admin",
    );
  }

  useAutosave(
    payloadKey,
    async () => {
      if (mode !== "edit" || !article) return;
      setSavingDraft(true);
      try {
        const updated = await autosave.mutateAsync({
          ...buildInput(),
          status: article.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
        });
        await getRevisionService().snapshot(updated, "autosave", "admin");
      } finally {
        setSavingDraft(false);
      }
    },
    mode === "edit" && Boolean(article?.id),
    4000,
  );

  async function runAiSeo() {
    const result = await getAiService().suggestSeo({
      title,
      content,
      category,
      locale: "fa",
    });
    setMetaTitle(result.seo.metaTitle ?? metaTitle);
    setMetaDescription(result.seo.metaDescription ?? metaDescription);
    setExcerpt(result.excerpt || excerpt);
    if (!slugTouched) setSlug(result.slug);
    if (result.tags.length) setTags(result.tags.join(", "));
  }

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title={mode === "create" ? "مقاله جدید" : "ویرایش مقاله"}
        subtitle="بدنه به‌صورت ProseMirror JSON ذخیره می‌شود؛ رندر عمومی بدون HTML خام است."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {savingDraft ? (
              <span className="text-xs text-muted-foreground">ذخیره خودکار…</span>
            ) : null}
            <Link
              href="/admin/articles"
              className={buttonVariants({ variant: "outline" })}
            >
              بازگشت
            </Link>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void persist(status === "PUBLISHED" ? "PUBLISHED" : "DRAFT")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              ذخیره
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void persist("PUBLISHED")}
            >
              انتشار
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <GlassPanel>
            <div className="space-y-4 p-1">
              <div className="space-y-2">
                <Label htmlFor="article-title">عنوان</Label>
                <Input
                  id="article-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان مقاله"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="article-slug">اسلاگ</Label>
                  <Input
                    id="article-slug"
                    dir="ltr"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="article-category">دسته‌بندی</Label>
                  <Input
                    id="article-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="مثلاً قلب و عروق"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="article-excerpt">خلاصه</Label>
                <Input
                  id="article-excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="در صورت خالی بودن از متن استخراج می‌شود"
                />
              </div>
            </div>
          </GlassPanel>

          <ArticleEditor content={content} onChange={setContent} />
        </div>

        <aside className="space-y-4">
          <GlassPanel>
            <div className="space-y-3 p-1">
              <p className="text-sm font-semibold">انتشار</p>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ArticleStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="وضعیت" />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ARTICLE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                زمان مطالعه تقریبی:{" "}
                {toPersianDigits(String(readingMinutes))} دقیقه
              </p>
            </div>
          </GlassPanel>

          <GlassPanel>
            <div className="space-y-3 p-1">
              <p className="text-sm font-semibold">کاور و برچسب‌ها</p>
              <MediaSourceField
                kind="image"
                label="تصویر کاور"
                url={coverUrl}
                onUrlChange={setCoverUrl}
                urlInputId="cover-url"
              />
              <div className="space-y-2">
                <Label htmlFor="cover-alt">alt کاور</Label>
                <Input
                  id="cover-alt"
                  value={coverAlt}
                  onChange={(e) => setCoverAlt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">برچسب‌ها (با کاما)</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </div>
          </GlassPanel>

          <GlassPanel>
            <div className="space-y-3 p-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">SEO</p>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void runAiSeo()}
                >
                  <Sparkles className="size-3.5" />
                  پیشنهاد AI
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-title">Meta title</Label>
                <Input
                  id="meta-title"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-desc">Meta description</Label>
                <Input
                  id="meta-desc"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                />
              </div>
            </div>
          </GlassPanel>

          {toc.length > 0 ? (
            <GlassPanel>
              <div className="space-y-2 p-1">
                <p className="text-sm font-semibold">فهرست مطالب</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {toc.map((entry) => (
                    <li
                      key={entry.id}
                      style={{ paddingInlineStart: (entry.level - 1) * 8 }}
                    >
                      {entry.text}
                    </li>
                  ))}
                </ul>
              </div>
            </GlassPanel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
