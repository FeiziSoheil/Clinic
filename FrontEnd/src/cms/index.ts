/**
 * Clinick Enterprise CMS — public barrel.
 *
 * Architecture boundaries:
 * - types/       content model (ProseMirror JSON primary storage)
 * - editor/      TipTap authoring surface + toolbar/dialogs
 * - extensions/  TipTap nodes (custom blocks register here)
 * - renderer/    JSON → React components (no HTML-as-source-of-truth)
 * - services/    article API, image/AI/revision interfaces
 * - hooks/       React Query + autosave/TOC helpers
 * - seo/         metadata + JSON-LD
 * - utils/       slug, reading time, TOC, excerpt
 *
 * Extend custom blocks: add TipTap Node → register renderer → optional slash item.
 * Do not store admin content as Markdown/HTML primary.
 */

export * from "./types";
export * from "./constants";
export * from "./utils";
export * from "./seo";
export * from "./services";
export * from "./hooks";
export { ArticleEditor } from "./editor";
export { ArticleRenderer, registerNodeRenderer } from "./renderer";
export { createArticleExtensions, createCMSExtensions } from "./extensions";
