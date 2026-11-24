import type { PMDocument, PMNode } from "../types/document";
import { slugify } from "./slug";

export interface TocEntry {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

function textOf(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

function headingId(text: string, used: Map<string, number>): string {
  const base = slugify(text) || "section";
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

/** Build a table of contents from heading nodes in the document. */
export function buildToc(doc: PMDocument): TocEntry[] {
  const entries: TocEntry[] = [];
  const used = new Map<string, number>();

  for (const node of doc.content ?? []) {
    if (node.type !== "heading") continue;
    const level = Number(node.attrs?.level ?? 2) as TocEntry["level"];
    const text = textOf(node).trim();
    if (!text) continue;
    const id =
      typeof node.attrs?.id === "string" && node.attrs.id
        ? node.attrs.id
        : headingId(text, used);
    entries.push({ id, level, text });
  }

  return entries;
}

/**
 * Walk the document and ensure every heading has a stable `attrs.id`.
 * Returns a new document (does not mutate the input).
 */
export function ensureHeadingIds(doc: PMDocument): PMDocument {
  const used = new Map<string, number>();
  const content = (doc.content ?? []).map((node) => {
    if (node.type !== "heading") return node;
    const text = textOf(node).trim();
    const existing =
      typeof node.attrs?.id === "string" ? node.attrs.id : undefined;
    const id = existing || headingId(text || "section", used);
    if (existing) {
      const count = used.get(existing) ?? 0;
      used.set(existing, count + 1);
    }
    return {
      ...node,
      attrs: { ...(node.attrs ?? {}), id },
    };
  });
  return { type: "doc", content };
}
