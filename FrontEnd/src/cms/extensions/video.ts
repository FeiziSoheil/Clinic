import { Node, mergeAttributes } from "@tiptap/core";

export interface VideoBlockAttrs {
  src: string;
  poster?: string;
  caption?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoBlock: {
      setVideoBlock: (attrs?: Partial<VideoBlockAttrs>) => ReturnType;
    };
  }
}

export const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: "" },
      poster: { default: "" },
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "video-block" }),
    ];
  },

  addCommands() {
    return {
      setVideoBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs?.src ?? "",
              poster: attrs?.poster ?? "",
              caption: attrs?.caption ?? "",
            },
          }),
    };
  },
});
