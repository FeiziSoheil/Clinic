import { Node, mergeAttributes } from "@tiptap/core";

export interface FileAttachmentAttrs {
  href: string;
  fileName: string;
  fileSize?: string;
  mimeType?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFileAttachment: (attrs?: Partial<FileAttachmentAttrs>) => ReturnType;
    };
  }
}

export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      href: { default: "#" },
      fileName: { default: "file.pdf" },
      fileSize: { default: "" },
      mimeType: { default: "application/pdf" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file-attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "file-attachment" }),
    ];
  },

  addCommands() {
    return {
      setFileAttachment:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              href: attrs?.href ?? "#",
              fileName: attrs?.fileName ?? "پیوست.pdf",
              fileSize: attrs?.fileSize ?? "",
              mimeType: attrs?.mimeType ?? "application/pdf",
            },
          }),
    };
  },
});
