/**
 * AI assistant contracts — loosely coupled to the editor.
 *
 * Implementations may call OpenAI / Claude / local models. The editor only
 * consumes results (rewritten text, SEO suggestions, tags) and never imports
 * provider SDKs directly.
 */

import type { PMDocument } from "./document";
import type { ArticleSeo } from "./seo";

export type AiTone =
  | "neutral"
  | "clinical"
  | "friendly"
  | "formal"
  | "simple";

export interface AiRewriteRequest {
  content: PMDocument;
  selectionText?: string;
  instruction?: string;
  tone?: AiTone;
  locale?: "fa" | "en";
}

export interface AiRewriteResult {
  content: PMDocument;
  selectionText?: string;
}

export interface AiSummarizeRequest {
  content: PMDocument;
  maxWords?: number;
  locale?: "fa" | "en";
}

export interface AiSeoSuggestRequest {
  title: string;
  content: PMDocument;
  category?: string;
  locale?: "fa" | "en";
}

export interface AiSeoSuggestResult {
  seo: ArticleSeo;
  tags: string[];
  slug: string;
  excerpt: string;
  coverPrompt?: string;
}

export interface AiTranslateRequest {
  content: PMDocument;
  title: string;
  excerpt: string;
  targetLocale: "fa" | "en";
}

export interface AiTranslateResult {
  content: PMDocument;
  title: string;
  excerpt: string;
}

/** Pluggable AI surface — stub returns heuristics until a provider is wired. */
export interface AiService {
  rewrite(req: AiRewriteRequest): Promise<AiRewriteResult>;
  summarize(req: AiSummarizeRequest): Promise<string>;
  suggestSeo(req: AiSeoSuggestRequest): Promise<AiSeoSuggestResult>;
  translate(req: AiTranslateRequest): Promise<AiTranslateResult>;
  suggestInternalLinks?(
    content: PMDocument,
  ): Promise<Array<{ text: string; href: string; reason: string }>>;
}
