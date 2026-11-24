import { Node, mergeAttributes } from "@tiptap/core";

export interface TabsItem {
  id: string;
  label: string;
  content: string;
}

export interface TabsBlockAttrs {
  items: TabsItem[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tabsBlock: {
      setTabsBlock: (attrs?: Partial<TabsBlockAttrs>) => ReturnType;
    };
  }
}

export const TabsBlock = Node.create({
  name: "tabsBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      items: {
        default: [
          { id: "t1", label: "تب ۱", content: "محتوای تب اول" },
          { id: "t2", label: "تب ۲", content: "محتوای تب دوم" },
        ] satisfies TabsItem[],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tabs-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tabs-block" }),
    ];
  },

  addCommands() {
    return {
      setTabsBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              items: attrs?.items ?? [
                { id: "t1", label: "تب ۱", content: "محتوای تب اول" },
                { id: "t2", label: "تب ۲", content: "محتوای تب دوم" },
              ],
            },
          }),
    };
  },
});
