import { Node, mergeAttributes } from "@tiptap/core";

export interface AccordionItem {
  id: string;
  title: string;
  content: string;
}

export interface AccordionBlockAttrs {
  items: AccordionItem[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    accordionBlock: {
      setAccordionBlock: (attrs?: Partial<AccordionBlockAttrs>) => ReturnType;
    };
  }
}

export const AccordionBlock = Node.create({
  name: "accordionBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      items: {
        default: [
          {
            id: "1",
            title: "سوال اول",
            content: "پاسخ را اینجا بنویسید.",
          },
        ] satisfies AccordionItem[],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="accordion-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "accordion-block" }),
    ];
  },

  addCommands() {
    return {
      setAccordionBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              items: attrs?.items ?? [
                {
                  id: "1",
                  title: "سوال متداول",
                  content: "پاسخ را اینجا بنویسید.",
                },
              ],
            },
          }),
    };
  },
});
