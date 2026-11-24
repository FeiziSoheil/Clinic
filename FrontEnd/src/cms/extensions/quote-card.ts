import { Node, mergeAttributes } from "@tiptap/core";

export interface QuoteCardAttrs {
  quote: string;
  author: string;
  role: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    quoteCard: {
      setQuoteCard: (attrs?: Partial<QuoteCardAttrs>) => ReturnType;
    };
  }
}

export const QuoteCard = Node.create({
  name: "quoteCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      quote: { default: "" },
      author: { default: "" },
      role: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="quote-card"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-type": "quote-card" }),
    ];
  },

  addCommands() {
    return {
      setQuoteCard:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              quote: attrs?.quote ?? "نقل‌قول را اینجا بنویسید…",
              author: attrs?.author ?? "نویسنده",
              role: attrs?.role ?? "",
            },
          }),
    };
  },
});
