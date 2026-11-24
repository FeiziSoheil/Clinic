import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import {
  SLASH_COMMAND_ITEMS,
  type SlashCommandItem,
} from "../constants/slash-items";
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "../editor/slash/SlashCommandList";

export const slashPluginKey = new PluginKey("slashCommands");

function runSlashCommand(
  editor: SuggestionProps<SlashCommandItem>["editor"],
  item: SlashCommandItem,
  range: { from: number; to: number },
) {
  editor.chain().focus().deleteRange(range).run();

  switch (item.command) {
    case "heading1":
      editor.chain().focus().setHeading({ level: 1 }).run();
      break;
    case "heading2":
      editor.chain().focus().setHeading({ level: 2 }).run();
      break;
    case "heading3":
      editor.chain().focus().setHeading({ level: 3 }).run();
      break;
    case "bulletList":
      editor.chain().focus().toggleBulletList().run();
      break;
    case "orderedList":
      editor.chain().focus().toggleOrderedList().run();
      break;
    case "taskList":
      editor.chain().focus().toggleTaskList().run();
      break;
    case "blockquote":
      editor.chain().focus().toggleBlockquote().run();
      break;
    case "codeBlock":
      editor.chain().focus().toggleCodeBlock().run();
      break;
    case "horizontalRule":
      editor.chain().focus().setHorizontalRule().run();
      break;
    case "table":
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
      break;
    case "image":
      editor
        .chain()
        .focus()
        .setImage({
          src: "/Images/درباره ما.jpg",
          alt: "تصویر مقاله",
        })
        .run();
      break;
    case "youtube":
      editor.commands.setYoutubeVideo({
        src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
      break;
    case "video":
      editor.commands.setVideoBlock({ src: "" });
      break;
    case "file":
      editor.commands.setFileAttachment({});
      break;
    case "calloutInfo":
      editor.commands.setCallout({ variant: "info", title: "نکته" });
      break;
    case "calloutWarning":
      editor.commands.setCallout({ variant: "warning", title: "هشدار" });
      break;
    case "calloutSuccess":
      editor.commands.setCallout({ variant: "success", title: "موفقیت" });
      break;
    case "quoteCard":
      editor.commands.setQuoteCard({});
      break;
    case "buttonBlock":
      editor.commands.setButtonBlock({});
      break;
    case "dividerBlock":
      editor.commands.setDividerBlock({});
      break;
    case "accordion":
      editor.commands.setAccordionBlock({});
      break;
    case "gallery":
      editor.commands.setGallery({});
      break;
    case "tabs":
      editor.commands.setTabsBlock({});
      break;
    case "columns":
      editor.commands.setColumns();
      break;
    case "link":
      editor.chain().focus().extendMarkRange("link").setLink({ href: "https://" }).run();
      break;
    default:
      break;
  }
}

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: slashPluginKey,
        startOfLine: false,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase().trim();
          if (!q) return SLASH_COMMAND_ITEMS;
          return SLASH_COMMAND_ITEMS.filter(
            (item) =>
              item.title.includes(q) ||
              item.description.includes(q) ||
              item.keywords.some((k) => k.toLowerCase().includes(q)),
          );
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: SuggestionProps<SlashCommandItem>["editor"];
          range: { from: number; to: number };
          props: SlashCommandItem;
        }) => {
          runSlashCommand(editor, props, range);
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              component?.updateProps(props);
              if (!props.clientRect || !popup?.[0]) return;
              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
