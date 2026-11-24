"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { renderInline } from "../MarkRenderer";
import type { PMNode } from "../../types/document";

export function ArticleHeading({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  const level = Number(node.attrs?.level ?? 2);
  const id = typeof node.attrs?.id === "string" ? node.attrs.id : undefined;
  const className = cn(
    "scroll-mt-[90px] font-bold tracking-tight text-foreground",
    level === 1 && "text-display-lg mt-10 mb-4",
    level === 2 && "text-2xl mt-8 mb-3",
    level === 3 && "text-xl mt-6 mb-2",
    level >= 4 && "text-lg mt-5 mb-2",
  );
  const content = children ?? renderInline(node.content, `h-${id ?? level}`);

  switch (level) {
    case 1:
      return (
        <h1 id={id} className={className}>
          {content}
        </h1>
      );
    case 2:
      return (
        <h2 id={id} className={className}>
          {content}
        </h2>
      );
    case 3:
      return (
        <h3 id={id} className={className}>
          {content}
        </h3>
      );
    case 4:
      return (
        <h4 id={id} className={className}>
          {content}
        </h4>
      );
    case 5:
      return (
        <h5 id={id} className={className}>
          {content}
        </h5>
      );
    default:
      return (
        <h6 id={id} className={className}>
          {content}
        </h6>
      );
  }
}
