"use client";

import type { ReactNode } from "react";

import type { PMNode } from "../../types/document";

export function ArticleTable({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  void node;
  return (
    <div className="my-5 overflow-x-auto rounded-2xl border border-border/70">
      <table className="w-full border-collapse text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ArticleTableRow({
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  return <tr className="border-b border-border/60 last:border-0">{children}</tr>;
}

export function ArticleTableCell({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  const Tag = node.type === "tableHeader" ? "th" : "td";
  return (
    <Tag
      className={
        Tag === "th"
          ? "bg-muted/50 px-3 py-2 text-start font-semibold text-foreground"
          : "px-3 py-2 align-top text-muted-foreground"
      }
      colSpan={Number(node.attrs?.colspan ?? 1)}
      rowSpan={Number(node.attrs?.rowspan ?? 1)}
    >
      {children}
    </Tag>
  );
}
