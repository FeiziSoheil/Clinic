import { Node, mergeAttributes } from "@tiptap/core";

import type { CalloutVariant } from "../constants/node-types";

export interface CalloutAttrs {
  variant: CalloutVariant;
  title: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: Partial<CalloutAttrs>) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info" satisfies CalloutVariant,
      },
      title: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-type": "callout" }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              variant: attrs?.variant ?? "info",
              title: attrs?.title ?? "",
            },
            content: [{ type: "paragraph" }],
          }),
    };
  },
});
