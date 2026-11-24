"use client";

import type { ReactNode } from "react";

import { renderInline } from "../MarkRenderer";
import type { PMNode } from "../../types/document";

export function ArticleParagraph({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  return (
    <p className="my-3 text-base leading-8 text-muted-foreground [&:has(+p)]:mb-2">
      {children ?? renderInline(node.content, "p")}
    </p>
  );
}
