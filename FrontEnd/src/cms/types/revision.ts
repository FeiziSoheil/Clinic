/**
 * Revision history model. Full UI (diff / restore) can land later; the CMS
 * keeps a stable contract so autosave and AI rewrite can attach revisions
 * without coupling to the TipTap editor.
 */

import type { PMDocument } from "./document";
import type { ArticleSeo } from "./seo";

export interface ArticleRevision {
  id: string;
  articleId: string;
  /** Monotonic revision number within the article. */
  version: number;
  label?: string;
  content: PMDocument;
  title: string;
  excerpt: string;
  seo: ArticleSeo;
  createdAt: string;
  createdBy: string;
  /** Optional reason: autosave | publish | ai | manual | restore. */
  source: "autosave" | "publish" | "ai" | "manual" | "restore";
}

export interface RevisionCompareResult {
  left: ArticleRevision;
  right: ArticleRevision;
  /** Opaque diff payload for a future visual compare UI. */
  changes: {
    titleChanged: boolean;
    excerptChanged: boolean;
    contentChanged: boolean;
    seoChanged: boolean;
  };
}
