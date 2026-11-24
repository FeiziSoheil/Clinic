import { Node, mergeAttributes } from "@tiptap/core";

export interface DividerBlockAttrs {
  style: "line" | "brand" | "dots";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dividerBlock: {
      setDividerBlock: (attrs?: Partial<DividerBlockAttrs>) => ReturnType;
    };
  }
}

export const DividerBlock = Node.create({
  name: "dividerBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      style: { default: "brand" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="divider-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "divider-block" }),
    ];
  },

  addCommands() {
    return {
      setDividerBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { style: attrs?.style ?? "brand" },
          }),
    };
  },
});
