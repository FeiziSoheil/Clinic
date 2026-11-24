/**
 * Heuristic AI stub — returns deterministic suggestions without calling a model.
 * Replace via {@link setAiService} when a provider is configured.
 */

import type { AiService } from "../types/ai";
import { documentPlainText } from "../utils/reading-time";
import { deriveExcerpt } from "../utils/excerpt";
import { slugify } from "../utils/slug";

export function createStubAiService(): AiService {
  return {
    async rewrite(req) {
      // Pass-through with optional tone note in first paragraph — no mutation of structure.
      return {
        content: req.content,
        selectionText: req.selectionText
          ? `${req.selectionText}`.trim()
          : undefined,
      };
    },

    async summarize(req) {
      return deriveExcerpt(req.content, req.maxWords ? req.maxWords * 6 : 160);
    },

    async suggestSeo(req) {
      const text = documentPlainText(req.content);
      const excerpt = deriveExcerpt(req.content);
      const words = text
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 8);
      const tags = Array.from(
        new Set([req.category, ...words].filter(Boolean) as string[]),
      ).slice(0, 6);
      return {
        seo: {
          metaTitle: req.title.slice(0, 60),
          metaDescription: excerpt.slice(0, 155),
          keywords: tags,
          robots: "index,follow",
          twitterCard: "summary_large_image",
        },
        tags,
        slug: slugify(req.title),
        excerpt,
        coverPrompt: `Medical illustration for: ${req.title}`,
      };
    },

    async translate(req) {
      return {
        content: req.content,
        title: req.title,
        excerpt: req.excerpt,
      };
    },

    async suggestInternalLinks() {
      return [
        {
          text: "رزرو نوبت",
          href: "/booking",
          reason: "Primary conversion path from educational content",
        },
      ];
    },
  };
}

let singleton: AiService | null = null;

export function getAiService(): AiService {
  if (!singleton) singleton = createStubAiService();
  return singleton;
}

export function setAiService(service: AiService): void {
  singleton = service;
}
