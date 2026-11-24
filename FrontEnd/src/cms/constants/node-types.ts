/**
 * Canonical ProseMirror / TipTap node type names used by the CMS.
 *
 * Custom block types are namespaced under clinic-* so they never collide with
 * TipTap core nodes. The renderer registry keys off these exact strings.
 */

/** Core TipTap / StarterKit node types. */
export const CORE_NODE_TYPES = [
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "youtube",
  "mention",
  "text",
] as const;

/** Custom enterprise blocks — extend here; register renderer + TipTap node. */
export const CUSTOM_NODE_TYPES = [
  "callout",
  "quoteCard",
  "buttonBlock",
  "dividerBlock",
  "accordionBlock",
  "gallery",
  "tabsBlock",
  "columns",
  "column",
  "fileAttachment",
  "videoBlock",
] as const;

/**
 * Future blocks reserved in the architecture (Hero, Pros/Cons, CTA, …).
 * Declaring them here documents the extension path without shipping UI yet.
 */
export const RESERVED_FUTURE_NODE_TYPES = [
  "heroBanner",
  "prosCons",
  "pricingTable",
  "comparisonTable",
  "ctaBlock",
  "faqBlock",
  "timeline",
  "alertBlock",
  "tweetEmbed",
  "githubEmbed",
  "codePlayground",
  "statsBlock",
  "featureGrid",
  "newsletterBlock",
  "adSlot",
  "relatedArticles",
  "authorQuote",
  "tableOfContents",
] as const;

export type CoreNodeType = (typeof CORE_NODE_TYPES)[number];
export type CustomNodeType = (typeof CUSTOM_NODE_TYPES)[number];
export type FutureNodeType = (typeof RESERVED_FUTURE_NODE_TYPES)[number];
export type CmsNodeType = CoreNodeType | CustomNodeType | FutureNodeType;

export const CALLOUT_VARIANTS = ["info", "warning", "success", "danger"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];
