"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Link2,
  ImageIcon,
  ListVideo,
  Video,
  FileUp,
  Table,
  Undo2,
  Redo2,
  Highlighter,
  Columns2,
  Info,
  AlignLeft,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function ToolBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-muted-foreground",
        active && "bg-brand/10 text-brand hover:bg-brand/15 hover:text-brand",
      )}
    >
      {children}
    </Button>
  );
}

export interface EditorToolbarProps {
  editor: Editor | null;
  onOpenLink: () => void;
  onOpenImage: () => void;
  onOpenYoutube: () => void;
  onOpenVideo: () => void;
  onOpenFile: () => void;
  className?: string;
}

export function EditorToolbar({
  editor,
  onOpenLink,
  onOpenImage,
  onOpenYoutube,
  onOpenVideo,
  onOpenFile,
  className,
}: EditorToolbarProps) {
  if (!editor) {
    return (
      <div
        className={cn(
          "flex h-11 items-center gap-1 border-b border-border/70 bg-muted/20 px-2",
          className,
        )}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-background/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
      role="toolbar"
      aria-label="نوار ابزار ویرایشگر"
    >
      <ToolBtn
        label="بازگردانی"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 />
      </ToolBtn>
      <ToolBtn
        label="جلو بردن"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 />
      </ToolBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolBtn
        label="عنوان ۱"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 />
      </ToolBtn>
      <ToolBtn
        label="عنوان ۲"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolBtn>
      <ToolBtn
        label="عنوان ۳"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolBtn>
      <ToolBtn
        label="پاراگراف"
        active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <AlignLeft />
      </ToolBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolBtn
        label="ضخیم"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolBtn>
      <ToolBtn
        label="ایتالیک"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolBtn>
      <ToolBtn
        label="زیرخط"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </ToolBtn>
      <ToolBtn
        label="خط‌خورده"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolBtn>
      <ToolBtn
        label="کد درون‌خطی"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code />
      </ToolBtn>
      <ToolBtn
        label="هایلایت"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter />
      </ToolBtn>
      <ToolBtn
        label="لینک"
        active={editor.isActive("link")}
        onClick={onOpenLink}
      >
        <Link2 />
      </ToolBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolBtn
        label="فهرست نقطه‌ای"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolBtn>
      <ToolBtn
        label="فهرست شماره‌دار"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolBtn>
      <ToolBtn
        label="چک‌لیست"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare />
      </ToolBtn>
      <ToolBtn
        label="نقل‌قول"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolBtn>
      <ToolBtn
        label="بلوک کد"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code />
      </ToolBtn>
      <ToolBtn
        label="خط جداکننده"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus />
      </ToolBtn>
      <ToolBtn
        label="جدول"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <Table />
      </ToolBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolBtn label="تصویر" onClick={onOpenImage}>
        <ImageIcon />
      </ToolBtn>
      <ToolBtn label="یوتیوب" onClick={onOpenYoutube}>
        <ListVideo />
      </ToolBtn>
      <ToolBtn label="ویدیو" onClick={onOpenVideo}>
        <Video />
      </ToolBtn>
      <ToolBtn label="پیوست فایل" onClick={onOpenFile}>
        <FileUp />
      </ToolBtn>
      <ToolBtn
        label="کال‌اوت"
        onClick={() =>
          editor.commands.setCallout({ variant: "info", title: "نکته" })
        }
      >
        <Info />
      </ToolBtn>
      <ToolBtn
        label="ستون‌ها"
        onClick={() => editor.commands.setColumns()}
      >
        <Columns2 />
      </ToolBtn>
    </div>
  );
}
