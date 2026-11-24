"use client";

/**
 * JSON → React article body renderer.
 *
 * Walks ProseMirror JSON and maps each node to a dedicated component.
 * Never uses dangerouslySetInnerHTML for article body content.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PMDocument, PMNode } from "../types/document";
import { renderInline } from "./MarkRenderer";
import { getNodeRenderer } from "./registry";

function renderNode(node: PMNode, key: string): ReactNode {
  if (
    node.type === "text" ||
    node.type === "hardBreak" ||
    node.type === "mention"
  ) {
    return renderInline([node], key);
  }

  const Renderer = getNodeRenderer(node.type);
  const children =
    node.content?.map((child, i) => renderNode(child, `${key}-${i}`)) ?? null;

  if (!Renderer) {
    return (
      <div key={key} data-unknown-node={node.type} className="my-2">
        {children}
      </div>
    );
  }

  return (
    <Renderer key={key} node={node}>
      {children}
    </Renderer>
  );
}

export interface ArticleRendererProps {
  content: PMDocument;
  className?: string;
}

export function ArticleRenderer({ content, className }: ArticleRendererProps) {
  const nodes = content.content ?? [];

  return (
    <div className={cn("cms-article-body max-w-none", className)}>
      {nodes.map((node, i) => renderNode(node, `n-${i}`))}
    </div>
  );
}
