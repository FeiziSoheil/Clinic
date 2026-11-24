"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toPersianDigits } from "@/lib/utils";

import {
  ARTICLE_STATUS_LABEL,
  ARTICLE_STATUSES,
} from "../constants/statuses";
import type { ArticleCoverImage, ArticleStatus } from "../types/article";
import type { ArticleSeo } from "../types/seo";
import { slugify } from "../utils/slug";

export interface ArticleMetaFormValues {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string;
  status: ArticleStatus;
  coverImageUrl: string;
  coverImageAlt: string;
  seo: ArticleSeo;
}

export interface ArticleMetaFormProps {
  values: ArticleMetaFormValues;
  onChange: (patch: Partial<ArticleMetaFormValues>) => void;
  readingMinutes: number;
  tocCount: number;
  autoSlugFromTitle?: boolean;
}

const CATEGORIES = [
  "قلب و عروق",
  "اطفال",
  "پوست",
  "دندانپزشکی",
  "زنان و زایمان",
  "ارتوپدی",
  "روانشناسی",
  "تغذیه",
  "عمومی",
];

export function ArticleMetaForm({
  values,
  onChange,
  readingMinutes,
  tocCount,
  autoSlugFromTitle = true,
}: ArticleMetaFormProps) {
  return (
    <aside className="space-y-5 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-foreground">اطلاعات مقاله</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          زمان مطالعه تقریبی: {toPersianDigits(String(readingMinutes))} دقیقه ·{" "}
          {toPersianDigits(String(tocCount))} عنوان در فهرست
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cms-title">عنوان</Label>
        <Input
          id="cms-title"
          value={values.title}
          onChange={(e) => {
            const title = e.target.value;
            const patch: Partial<ArticleMetaFormValues> = { title };
            if (autoSlugFromTitle) {
              patch.slug = slugify(title);
            }
            onChange(patch);
          }}
          placeholder="عنوان مقاله"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cms-slug">اسلاگ</Label>
        <Input
          id="cms-slug"
          dir="ltr"
          value={values.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          placeholder="article-slug"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cms-excerpt">خلاصه</Label>
        <textarea
          id="cms-excerpt"
          rows={3}
          value={values.excerpt}
          onChange={(e) => onChange({ excerpt: e.target.value })}
          placeholder="خلاصه کوتاه برای کارت و SEO"
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="space-y-2">
        <Label>دسته‌بندی</Label>
        <Select
          value={values.category || CATEGORIES[CATEGORIES.length - 1]}
          onValueChange={(category) => {
            if (category) onChange({ category });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="انتخاب دسته" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cms-tags">برچسب‌ها</Label>
        <Input
          id="cms-tags"
          value={values.tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          placeholder="قلب، پیشگیری، سبک زندگی"
        />
        <p className="text-[0.7rem] text-muted-foreground">
          با ویرگول جدا کنید
        </p>
      </div>

      <div className="space-y-2">
        <Label>وضعیت</Label>
        <Select
          value={values.status}
          onValueChange={(status) => {
            if (status) onChange({ status: status as ArticleStatus });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARTICLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ARTICLE_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cms-cover">تصویر کاور</Label>
        <Input
          id="cms-cover"
          dir="ltr"
          value={values.coverImageUrl}
          onChange={(e) => onChange({ coverImageUrl: e.target.value })}
          placeholder="/Images/…"
        />
        <Input
          aria-label="متن جایگزین کاور"
          value={values.coverImageAlt}
          onChange={(e) => onChange({ coverImageAlt: e.target.value })}
          placeholder="متن جایگزین کاور"
        />
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <h3 className="text-sm font-semibold">SEO</h3>
        <div className="space-y-2">
          <Label htmlFor="cms-seo-title">Meta title</Label>
          <Input
            id="cms-seo-title"
            value={values.seo.metaTitle ?? ""}
            onChange={(e) =>
              onChange({ seo: { ...values.seo, metaTitle: e.target.value } })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cms-seo-desc">Meta description</Label>
          <textarea
            id="cms-seo-desc"
            rows={2}
            value={values.seo.metaDescription ?? ""}
            onChange={(e) =>
              onChange({
                seo: { ...values.seo, metaDescription: e.target.value },
              })
            }
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </div>
    </aside>
  );
}

export function coverFromMeta(
  values: ArticleMetaFormValues,
): ArticleCoverImage | null {
  if (!values.coverImageUrl.trim()) return null;
  return {
    url: values.coverImageUrl.trim(),
    alt: values.coverImageAlt.trim() || values.title,
  };
}

export function tagsFromMeta(values: ArticleMetaFormValues): string[] {
  return values.tags
    .split(/[,،]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
