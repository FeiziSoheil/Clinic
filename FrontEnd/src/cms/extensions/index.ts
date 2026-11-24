/**
 * Composed TipTap extension set for the Clinick article editor.
 *
 * Add a custom block by: (1) creating a Node extension here, (2) registering a
 * renderer component in `renderer/registry`, (3) optionally adding a slash item.
 * Core editor wiring should not need changes for new block types.
 */

import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Youtube from "@tiptap/extension-youtube";
import CharacterCount from "@tiptap/extension-character-count";
import Typography from "@tiptap/extension-typography";
import { TableKit } from "@tiptap/extension-table";
import Mention from "@tiptap/extension-mention";
import Heading from "@tiptap/extension-heading";
import type { Extensions } from "@tiptap/core";

import { Callout } from "./callout";
import { QuoteCard } from "./quote-card";
import { ButtonBlock } from "./button-block";
import { DividerBlock } from "./divider-block";
import { AccordionBlock } from "./accordion";
import { Gallery } from "./gallery";
import { TabsBlock } from "./tabs";
import { Columns, Column } from "./columns";
import { FileAttachment } from "./file-attachment";
import { VideoBlock } from "./video";
import { SlashCommands } from "./slash-command";

export function createArticleExtensions(options?: {
  placeholder?: string;
}): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: {
        HTMLAttributes: {
          class: "cms-code-block",
        },
      },
    }),
    Heading.configure({
      levels: [1, 2, 3, 4, 5, 6],
    }).extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("id"),
            renderHTML: (attributes) =>
              attributes.id ? { id: attributes.id as string } : {},
          },
        };
      },
    }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
        class: "cms-link",
      },
    }),
    Image.configure({
      allowBase64: true,
      HTMLAttributes: {
        class: "cms-image",
      },
    }),
    TableKit.configure({
      table: { resizable: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Youtube.configure({
      controls: true,
      nocookie: true,
      width: 640,
      height: 360,
    }),
    Placeholder.configure({
      placeholder:
        options?.placeholder ??
        "متن مقاله را بنویسید یا با / بلوک جدید اضافه کنید…",
    }),
    CharacterCount,
    Typography,
    Mention.configure({
      HTMLAttributes: { class: "cms-mention" },
      suggestion: {
        items: ({ query }) => {
          const people = ["پزشک", "پذیرش", "کلینیک", "بیمار"];
          return people
            .filter((p) => p.includes(query))
            .slice(0, 5);
        },
      },
    }),
    Callout,
    QuoteCard,
    ButtonBlock,
    DividerBlock,
    AccordionBlock,
    Gallery,
    TabsBlock,
    Columns,
    Column,
    FileAttachment,
    VideoBlock,
    SlashCommands,
  ];
}

/** Alias used by the editor shell and docs — same as {@link createArticleExtensions}. */
export const createCMSExtensions = createArticleExtensions;

export {
  Callout,
  QuoteCard,
  ButtonBlock,
  DividerBlock,
  AccordionBlock,
  Gallery,
  TabsBlock,
  Columns,
  Column,
  FileAttachment,
  VideoBlock,
  SlashCommands,
};
