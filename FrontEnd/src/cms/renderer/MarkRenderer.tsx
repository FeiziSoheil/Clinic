"use client";

import type { ReactNode } from "react";

import type { PMMark, PMNode } from "../types/document";
import { cn } from "@/lib/utils";

/** Render TipTap marks onto a text leaf without HTML injection. */
export function renderMarks(
  text: string,
  marks: PMMark[] | undefined,
  key: string,
): ReactNode {
  let node: ReactNode = text;
  if (!marks?.length) return <span key={key}>{node}</span>;

  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        node = <strong key={`${key}-b`}>{node}</strong>;
        break;
      case "italic":
        node = <em key={`${key}-i`}>{node}</em>;
        break;
      case "underline":
        node = <u key={`${key}-u`}>{node}</u>;
        break;
      case "strike":
        node = <s key={`${key}-s`}>{node}</s>;
        break;
      case "code":
        node = (
          <code
            key={`${key}-c`}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
          >
            {node}
          </code>
        );
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "#");
        const target = mark.attrs?.target ? String(mark.attrs.target) : undefined;
        node = (
          <a
            key={`${key}-a`}
            href={href}
            target={target}
            rel="noopener noreferrer"
            className="font-medium text-brand underline underline-offset-4 hover:text-brand/80"
          >
            {node}
          </a>
        );
        break;
      }
      case "highlight": {
        const color = mark.attrs?.color
          ? String(mark.attrs.color)
          : "var(--brand-mint, #d1fae5)";
        node = (
          <mark
            key={`${key}-h`}
            style={{ backgroundColor: color }}
            className="rounded px-0.5"
          >
            {node}
          </mark>
        );
        break;
      }
      case "textStyle": {
        const color = mark.attrs?.color
          ? String(mark.attrs.color)
          : undefined;
        node = (
          <span key={`${key}-ts`} style={color ? { color } : undefined}>
            {node}
          </span>
        );
        break;
      }
      case "mention": {
        const label = mark.attrs?.label ?? mark.attrs?.id ?? text;
        node = (
          <span
            key={`${key}-m`}
            className="rounded-md bg-brand/10 px-1.5 py-0.5 text-brand"
          >
            @{String(label)}
          </span>
        );
        break;
      }
      default:
        break;
    }
  }

  return <span key={key}>{node}</span>;
}

export function renderInline(
  nodes: PMNode[] | undefined,
  parentKey: string,
): ReactNode[] {
  if (!nodes?.length) return [];
  return nodes.map((node, index) => {
    const key = `${parentKey}-${index}`;
    if (node.type === "text") {
      return renderMarks(node.text ?? "", node.marks, key);
    }
    if (node.type === "hardBreak") {
      return <br key={key} />;
    }
    if (node.type === "mention") {
      const label = String(node.attrs?.label ?? node.attrs?.id ?? "mention");
      return (
        <span
          key={key}
          className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm text-brand"
        >
          @{label}
        </span>
      );
    }
    return (
      <span key={key} className={cn("inline")}>
        {renderInline(node.content, key)}
      </span>
    );
  });
}
