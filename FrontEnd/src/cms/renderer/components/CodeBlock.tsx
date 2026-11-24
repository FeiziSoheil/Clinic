"use client";

import { renderInline } from "../MarkRenderer";
import type { PMNode } from "../../types/document";

export function CodeBlock({ node }: { node: PMNode }) {
  const language = node.attrs?.language
    ? String(node.attrs.language)
    : undefined;
  const code = (node.content ?? [])
    .map((n) => n.text ?? "")
    .join("");

  return (
    <pre
      className="my-5 overflow-x-auto rounded-2xl border border-border/70 bg-[#0f172a] p-4 text-sm leading-relaxed text-slate-100"
      data-language={language}
    >
      <code>{code || renderInline(node.content, "code")}</code>
    </pre>
  );
}
