import type { PMDocument } from "../types/document";
import { documentPlainText } from "./reading-time";

/** Derive a short excerpt from the document body when the author left it empty. */
export function deriveExcerpt(doc: PMDocument, maxLength = 160): string {
  const text = documentPlainText(doc);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}
