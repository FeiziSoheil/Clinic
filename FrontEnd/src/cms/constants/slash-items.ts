import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckSquare,
  Columns2,
  FileUp,
  GalleryHorizontal,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Info,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareMousePointer,
  Table,
  Video,
  ListVideo,
  Code2,
  PanelTop,
  LayoutList,
} from "lucide-react";

/** Slash-menu item inserted via `/` in the editor. */
export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  /** TipTap command group key handled by the slash extension. */
  command:
    | "heading1"
    | "heading2"
    | "heading3"
    | "bulletList"
    | "orderedList"
    | "taskList"
    | "blockquote"
    | "codeBlock"
    | "horizontalRule"
    | "table"
    | "image"
    | "youtube"
    | "video"
    | "file"
    | "calloutInfo"
    | "calloutWarning"
    | "calloutSuccess"
    | "quoteCard"
    | "buttonBlock"
    | "dividerBlock"
    | "accordion"
    | "gallery"
    | "tabs"
    | "columns"
    | "link";
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    id: "h1",
    title: "عنوان ۱",
    description: "سرتیتر اصلی بخش",
    keywords: ["h1", "heading", "عنوان"],
    icon: Heading1,
    command: "heading1",
  },
  {
    id: "h2",
    title: "عنوان ۲",
    description: "سرتیتر فرعی",
    keywords: ["h2", "heading", "عنوان"],
    icon: Heading2,
    command: "heading2",
  },
  {
    id: "h3",
    title: "عنوان ۳",
    description: "سرتیتر کوچک‌تر",
    keywords: ["h3", "heading", "عنوان"],
    icon: Heading3,
    command: "heading3",
  },
  {
    id: "bullet",
    title: "فهرست نقطه‌ای",
    description: "لیست بدون شماره",
    keywords: ["ul", "bullet", "list", "لیست"],
    icon: List,
    command: "bulletList",
  },
  {
    id: "ordered",
    title: "فهرست شماره‌دار",
    description: "لیست مرتب",
    keywords: ["ol", "ordered", "list", "شماره"],
    icon: ListOrdered,
    command: "orderedList",
  },
  {
    id: "task",
    title: "چک‌لیست",
    description: "لیست وظایف قابل تیک",
    keywords: ["todo", "task", "check"],
    icon: CheckSquare,
    command: "taskList",
  },
  {
    id: "quote",
    title: "نقل‌قول",
    description: "بلوک نقل‌قول",
    keywords: ["quote", "blockquote"],
    icon: Quote,
    command: "blockquote",
  },
  {
    id: "code",
    title: "بلوک کد",
    description: "قطعه کد چندخطی",
    keywords: ["code", "کد"],
    icon: Code2,
    command: "codeBlock",
  },
  {
    id: "hr",
    title: "خط جداکننده",
    description: "فاصله افقی",
    keywords: ["hr", "divider", "خط"],
    icon: Minus,
    command: "horizontalRule",
  },
  {
    id: "table",
    title: "جدول",
    description: "جدول ۳×۳",
    keywords: ["table", "جدول"],
    icon: Table,
    command: "table",
  },
  {
    id: "image",
    title: "تصویر",
    description: "درج تصویر با متن جایگزین",
    keywords: ["image", "img", "تصویر"],
    icon: ImageIcon,
    command: "image",
  },
  {
    id: "youtube",
    title: "یوتیوب",
    description: "ویدیوی یوتیوب",
    keywords: ["youtube", "embed"],
    icon: ListVideo,
    command: "youtube",
  },
  {
    id: "video",
    title: "ویدیو",
    description: "ویدیوی خودمیزبان",
    keywords: ["video", "ویدیو"],
    icon: Video,
    command: "video",
  },
  {
    id: "file",
    title: "پیوست فایل",
    description: "لینک دانلود فایل",
    keywords: ["file", "attachment", "فایل"],
    icon: FileUp,
    command: "file",
  },
  {
    id: "callout-info",
    title: "نکته / اطلاعات",
    description: "باکس اطلاع‌رسانی",
    keywords: ["callout", "info", "نکته"],
    icon: Info,
    command: "calloutInfo",
  },
  {
    id: "callout-warn",
    title: "هشدار",
    description: "باکس هشدار",
    keywords: ["callout", "warning", "هشدار"],
    icon: AlertTriangle,
    command: "calloutWarning",
  },
  {
    id: "callout-ok",
    title: "موفقیت",
    description: "باکس موفقیت",
    keywords: ["callout", "success"],
    icon: CheckSquare,
    command: "calloutSuccess",
  },
  {
    id: "quote-card",
    title: "کارت نقل‌قول",
    description: "نقل‌قول با نویسنده",
    keywords: ["quote", "card", "author"],
    icon: Quote,
    command: "quoteCard",
  },
  {
    id: "button",
    title: "دکمه / CTA",
    description: "دکمه لینک‌دار",
    keywords: ["button", "cta", "دکمه"],
    icon: SquareMousePointer,
    command: "buttonBlock",
  },
  {
    id: "divider",
    title: "جداکننده تزئینی",
    description: "دیوایدر برند",
    keywords: ["divider", "separator"],
    icon: Minus,
    command: "dividerBlock",
  },
  {
    id: "accordion",
    title: "آکاردئون / FAQ",
    description: "سوالات جمع‌شونده",
    keywords: ["faq", "accordion", "سوال"],
    icon: LayoutList,
    command: "accordion",
  },
  {
    id: "gallery",
    title: "گالری تصاویر",
    description: "چند تصویر کنار هم",
    keywords: ["gallery", "گالری"],
    icon: GalleryHorizontal,
    command: "gallery",
  },
  {
    id: "tabs",
    title: "تب‌ها",
    description: "محتوای تب‌بندی‌شده",
    keywords: ["tabs", "تب"],
    icon: PanelTop,
    command: "tabs",
  },
  {
    id: "columns",
    title: "ستون‌ها",
    description: "دو ستون محتوا",
    keywords: ["columns", "layout", "ستون"],
    icon: Columns2,
    command: "columns",
  },
  {
    id: "link",
    title: "لینک",
    description: "افزودن لینک به متن",
    keywords: ["link", "url", "لینک"],
    icon: Link2,
    command: "link",
  },
];
