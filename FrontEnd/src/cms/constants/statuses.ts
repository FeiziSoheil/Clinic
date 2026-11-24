import type { ArticleStatus } from "../types/article";

export const ARTICLE_STATUSES: ArticleStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "SCHEDULED",
  "ARCHIVED",
  "PRIVATE",
  "PREVIEW",
  "REVISION",
];

/** Persian labels for admin UI. */
export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
  SCHEDULED: "زمان‌بندی‌شده",
  ARCHIVED: "بایگانی",
  PRIVATE: "خصوصی",
  PREVIEW: "پیش‌نمایش",
  REVISION: "بازبینی",
};

/** Statuses visible on the public site without a preview token. */
export const PUBLIC_ARTICLE_STATUSES: ArticleStatus[] = ["PUBLISHED"];
