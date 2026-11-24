/**
 * Revision history service (in-memory stub).
 *
 * Autosave and publish flows can call {@link RevisionService.snapshot}.
 * Compare / restore UIs attach later without changing the Article model.
 */

import type { Article } from "../types/article";
import type { ArticleRevision, RevisionCompareResult } from "../types/revision";

export interface RevisionService {
  list(articleId: string): Promise<ArticleRevision[]>;
  get(articleId: string, revisionId: string): Promise<ArticleRevision | null>;
  snapshot(
    article: Article,
    source: ArticleRevision["source"],
    createdBy: string,
    label?: string,
  ): Promise<ArticleRevision>;
  compare(
    articleId: string,
    leftId: string,
    rightId: string,
  ): Promise<RevisionCompareResult>;
  restore(articleId: string, revisionId: string): Promise<ArticleRevision>;
}

const store = new Map<string, ArticleRevision[]>();

export function createStubRevisionService(): RevisionService {
  return {
    async list(articleId) {
      return [...(store.get(articleId) ?? [])].sort(
        (a, b) => b.version - a.version,
      );
    },

    async get(articleId, revisionId) {
      return (
        store.get(articleId)?.find((r) => r.id === revisionId) ?? null
      );
    },

    async snapshot(article, source, createdBy, label) {
      const list = store.get(article.id) ?? [];
      const revision: ArticleRevision = {
        id: `rev-${Math.random().toString(36).slice(2, 10)}`,
        articleId: article.id,
        version: (list[0]?.version ?? 0) + 1,
        label,
        content: article.content,
        title: article.title,
        excerpt: article.excerpt,
        seo: article.seo,
        createdAt: new Date().toISOString(),
        createdBy,
        source,
      };
      store.set(article.id, [revision, ...list].slice(0, 50));
      return revision;
    },

    async compare(articleId, leftId, rightId) {
      const list = store.get(articleId) ?? [];
      const left = list.find((r) => r.id === leftId);
      const right = list.find((r) => r.id === rightId);
      if (!left || !right) throw new Error("revision not found");
      return {
        left,
        right,
        changes: {
          titleChanged: left.title !== right.title,
          excerptChanged: left.excerpt !== right.excerpt,
          contentChanged:
            JSON.stringify(left.content) !== JSON.stringify(right.content),
          seoChanged: JSON.stringify(left.seo) !== JSON.stringify(right.seo),
        },
      };
    },

    async restore(articleId, revisionId) {
      const revision = await this.get(articleId, revisionId);
      if (!revision) throw new Error("revision not found");
      return this.snapshot(
        {
          id: articleId,
          title: revision.title,
          slug: "",
          excerpt: revision.excerpt,
          category: "",
          tags: [],
          author: { id: revision.createdBy, name: revision.createdBy },
          status: "REVISION",
          seo: revision.seo,
          content: revision.content,
          readingMinutes: 1,
          createdAt: revision.createdAt,
          updatedAt: revision.createdAt,
        },
        "restore",
        revision.createdBy,
        `Restore v${revision.version}`,
      );
    },
  };
}

let singleton: RevisionService | null = null;

export function getRevisionService(): RevisionService {
  if (!singleton) singleton = createStubRevisionService();
  return singleton;
}
