import { Node, mergeAttributes } from "@tiptap/core";

export interface ButtonBlockAttrs {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "outline";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    buttonBlock: {
      setButtonBlock: (attrs?: Partial<ButtonBlockAttrs>) => ReturnType;
    };
  }
}

export const ButtonBlock = Node.create({
  name: "buttonBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      label: { default: "ادامه مطلب" },
      href: { default: "#" },
      variant: { default: "primary" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="button-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "button-block" }),
    ];
  },

  addCommands() {
    return {
      setButtonBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              label: attrs?.label ?? "ادامه مطلب",
              href: attrs?.href ?? "#",
              variant: attrs?.variant ?? "primary",
            },
          }),
    };
  },
});
