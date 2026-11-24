import { Node, mergeAttributes } from "@tiptap/core";

export interface GalleryImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface GalleryAttrs {
  images: GalleryImage[];
  columns: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    gallery: {
      setGallery: (attrs?: Partial<GalleryAttrs>) => ReturnType;
    };
  }
}

export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      images: { default: [] satisfies GalleryImage[] },
      columns: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="gallery"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "gallery" }),
    ];
  },

  addCommands() {
    return {
      setGallery:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              images: attrs?.images ?? [
                {
                  src: "/Images/درباره ما.jpg",
                  alt: "تصویر گالری",
                },
              ],
              columns: attrs?.columns ?? 2,
            },
          }),
    };
  },
});
