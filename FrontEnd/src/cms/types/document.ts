/**
 * ProseMirror / TipTap JSON document model.
 *
 * Primary storage format for admin-authored article bodies. HTML and Markdown
 * are never the source of truth — only JSON nodes + marks. Rendering maps each
 * node type to a dedicated React component via the renderer registry.
 */

import type { JSONContent } from "@tiptap/core";

/** Inline text mark applied to a text node (bold, link, color, …). */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown> | null;
}

/** A single ProseMirror node in the TipTap JSON tree. */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown> | null;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

/**
 * Root document node. TipTap `editor.getJSON()` returns this shape.
 * Always persist this object (or its stringified form) — never HTML.
 */
export interface PMDocument {
  type: "doc";
  content?: PMNode[];
}

/** Empty document used for new drafts. */
export const EMPTY_DOCUMENT: PMDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Type guard for a ProseMirror document root. */
export function isPMDocument(value: unknown): value is PMDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as { type?: unknown; content?: unknown };
  return doc.type === "doc" && (doc.content === undefined || Array.isArray(doc.content));
}

/** Bridge CMS {@link PMDocument} into TipTap's JSON content type. */
export function toEditorContent(doc: PMDocument): JSONContent {
  return doc as unknown as JSONContent;
}

/** Parse TipTap editor JSON back into a CMS document. */
export function fromEditorContent(json: JSONContent): PMDocument {
  if (isPMDocument(json)) return json;
  return EMPTY_DOCUMENT;
}
