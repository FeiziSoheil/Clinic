import type { PMDocument, PMNode } from "../types/document";

const WORDS_PER_MINUTE = 200;

function collectText(node: PMNode | undefined, parts: string[]): void {
  if (!node) return;
  if (node.type === "text" && node.text) {
    parts.push(node.text);
    return;
  }
  for (const child of node.content ?? []) {
    collectText(child, parts);
  }
}

/** Extract plain text from a ProseMirror document (for reading time / excerpt). */
export function documentPlainText(doc: PMDocument): string {
  const parts: string[] = [];
  for (const child of doc.content ?? []) {
    collectText(child, parts);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Estimate reading minutes from ProseMirror JSON (Persian + Latin aware). */
export function estimateReadingMinutes(doc: PMDocument): number {
  const text = documentPlainText(doc);
  if (!text) return 1;
  // Count whitespace-separated tokens; Persian often has fewer spaces so floor at 1.
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.replace(/\s/g, "").length;
  const byWords = Math.ceil(words / WORDS_PER_MINUTE);
  const byChars = Math.ceil(chars / (WORDS_PER_MINUTE * 5));
  return Math.max(1, Math.max(byWords, byChars));
}
