"use client";

/**
 * TipTap article body editor for the Clinick CMS.
 *
 * Persists ProseMirror JSON only — never HTML. Slash commands, toolbar inserts,
 * and custom blocks are wired through `createCMSExtensions`.
 */

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import "tippy.js/dist/tippy.css";

import { cn, toPersianDigits } from "@/lib/utils";
import { createCMSExtensions } from "../extensions";
import {
  EMPTY_DOCUMENT,
  fromEditorContent,
  toEditorContent,
  type PMDocument,
} from "../types/document";
import { FileDialog } from "./dialogs/FileDialog";
import { ImageDialog } from "./dialogs/ImageDialog";
import { LinkDialog } from "./dialogs/LinkDialog";
import { VideoDialog } from "./dialogs/VideoDialog";
import { YoutubeDialog } from "./dialogs/YoutubeDialog";
import { EditorToolbar } from "./EditorToolbar";
import "./editor.css";

export interface ArticleEditorProps {
  content: PMDocument;
  onChange: (doc: PMDocument) => void;
  editable?: boolean;
  className?: string;
  /** Called when the TipTap instance is ready (for parent save/focus hooks). */
  onEditorReady?: (editor: Editor) => void;
}

function asDocument(json: unknown): PMDocument {
  if (json && typeof json === "object" && "type" in json) {
    return fromEditorContent(json as Parameters<typeof fromEditorContent>[0]);
  }
  return EMPTY_DOCUMENT;
}

export function ArticleEditor({
  content,
  onChange,
  editable = true,
  className,
  onEditorReady,
}: ArticleEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: createCMSExtensions({
      placeholder: "متن مقاله را بنویسید یا با / بلوک جدید اضافه کنید…",
    }),
    content: toEditorContent(content),
    editorProps: {
      attributes: {
        class:
          "cms-editor-content prose-cms min-h-[420px] px-4 py-5 outline-none focus:outline-none",
        dir: "rtl",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(asDocument(ed.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor || !onEditorReady) return;
    onEditorReady(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Sync external document resets (load article / new draft) without clobbering typing.
  const lastAppliedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    const nextKey = JSON.stringify(content);
    if (lastAppliedKeyRef.current === nextKey) return;

    const currentKey = JSON.stringify(editor.getJSON());
    if (currentKey === nextKey) {
      lastAppliedKeyRef.current = nextKey;
      return;
    }

    editor.commands.setContent(toEditorContent(content), { emitUpdate: false });
    lastAppliedKeyRef.current = nextKey;
  }, [editor, content]);

  const chars =
    editor?.storage.characterCount?.characters?.() ?? 0;
  const words = editor?.storage.characterCount?.words?.() ?? 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      <EditorToolbar
        editor={editor}
        onOpenLink={() => setLinkOpen(true)}
        onOpenImage={() => setImageOpen(true)}
        onOpenYoutube={() => setYoutubeOpen(true)}
        onOpenVideo={() => setVideoOpen(true)}
        onOpenFile={() => setFileOpen(true)}
      />

      <EditorContent editor={editor} />

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground tabular-nums">
        <span>برای درج بلوک، `/` را تایپ کنید</span>
        <span>
          {toPersianDigits(String(words))} واژه ·{" "}
          {toPersianDigits(String(chars))} نویسه
        </span>
      </div>

      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        initialHref={
          editor?.getAttributes("link").href
            ? String(editor.getAttributes("link").href)
            : "https://"
        }
        onSubmit={(href) => {
          editor
            ?.chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href })
            .run();
        }}
        onRemove={() => {
          editor?.chain().focus().extendMarkRange("link").unsetLink().run();
        }}
      />

      <ImageDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        onSubmit={({ src, alt }) => {
          editor?.chain().focus().setImage({ src, alt }).run();
        }}
      />

      <YoutubeDialog
        open={youtubeOpen}
        onOpenChange={setYoutubeOpen}
        onSubmit={(src) => {
          editor?.commands.setYoutubeVideo({ src });
        }}
      />

      <VideoDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        onSubmit={(values) => {
          editor?.commands.setVideoBlock(values);
        }}
      />

      <FileDialog
        open={fileOpen}
        onOpenChange={setFileOpen}
        onSubmit={(values) => {
          editor?.commands.setFileAttachment(values);
        }}
      />
    </div>
  );
}
