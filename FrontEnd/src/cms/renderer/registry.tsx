"use client";

/**
 * Node → React component registry.
 *
 * Register new custom blocks here without touching ArticleRenderer core.
 * Future blocks (heroBanner, prosCons, CTA, …) follow the same pattern.
 */

import type { ComponentType, ReactNode } from "react";

import type { PMNode } from "../types/document";
import { ArticleHeading } from "./components/ArticleHeading";
import { ArticleParagraph } from "./components/ArticleParagraph";
import { ArticleImage } from "./components/ArticleImage";
import { CodeBlock } from "./components/CodeBlock";
import { Callout } from "./components/Callout";
import {
  ArticleTable,
  ArticleTableCell,
  ArticleTableRow,
} from "./components/ArticleTable";
import {
  AccordionBlockView,
  Blockquote,
  BulletList,
  ButtonBlock,
  ColumnView,
  ColumnsView,
  DividerBlock,
  FileAttachment,
  HorizontalRule,
  ImageGallery,
  ListItem,
  OrderedList,
  QuoteCard,
  TabsBlockView,
  TaskItem,
  TaskList,
  VideoBlock,
  YoutubeEmbed,
} from "./components/Blocks";

export interface NodeRenderProps {
  node: PMNode;
  children?: ReactNode;
}

export type NodeRenderer = ComponentType<NodeRenderProps>;

const registry = new Map<string, NodeRenderer>();

export function registerNodeRenderer(type: string, component: NodeRenderer): void {
  registry.set(type, component);
}

export function getNodeRenderer(type: string): NodeRenderer | undefined {
  return registry.get(type);
}

function registerDefaults(): void {
  if (registry.size > 0) return;

  registerNodeRenderer("heading", ArticleHeading);
  registerNodeRenderer("paragraph", ArticleParagraph);
  registerNodeRenderer("image", ArticleImage);
  registerNodeRenderer("codeBlock", CodeBlock);
  registerNodeRenderer("callout", Callout);
  registerNodeRenderer("blockquote", Blockquote);
  registerNodeRenderer("horizontalRule", () => <HorizontalRule />);
  registerNodeRenderer("bulletList", ({ children }) => (
    <BulletList>{children}</BulletList>
  ));
  registerNodeRenderer("orderedList", ({ children }) => (
    <OrderedList>{children}</OrderedList>
  ));
  registerNodeRenderer("listItem", ({ children }) => (
    <ListItem>{children}</ListItem>
  ));
  registerNodeRenderer("taskList", ({ children }) => (
    <TaskList>{children}</TaskList>
  ));
  registerNodeRenderer("taskItem", TaskItem);
  registerNodeRenderer("table", ArticleTable);
  registerNodeRenderer("tableRow", ArticleTableRow);
  registerNodeRenderer("tableCell", ArticleTableCell);
  registerNodeRenderer("tableHeader", ArticleTableCell);
  registerNodeRenderer("youtube", YoutubeEmbed);
  registerNodeRenderer("quoteCard", QuoteCard);
  registerNodeRenderer("buttonBlock", ButtonBlock);
  registerNodeRenderer("dividerBlock", DividerBlock);
  registerNodeRenderer("fileAttachment", FileAttachment);
  registerNodeRenderer("videoBlock", VideoBlock);
  registerNodeRenderer("gallery", ImageGallery);
  registerNodeRenderer("accordionBlock", AccordionBlockView);
  registerNodeRenderer("tabsBlock", TabsBlockView);
  registerNodeRenderer("columns", ColumnsView);
  registerNodeRenderer("column", ColumnView);
}

registerDefaults();
