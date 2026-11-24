"use client";

import { useState, type ReactNode } from "react";
import { Quote } from "lucide-react";

import type { PMNode } from "../../types/document";

export function QuoteCard({ node }: { node: PMNode }) {
  const quote = String(node.attrs?.quote ?? "");
  const author = String(node.attrs?.author ?? "");
  const role = String(node.attrs?.role ?? "");

  return (
    <figure className="my-6 rounded-2xl border border-border/70 bg-muted/30 p-5">
      <Quote className="mb-3 size-5 text-brand" aria-hidden="true" />
      <blockquote className="text-lg font-medium leading-8 text-foreground">
        {quote}
      </blockquote>
      {(author || role) && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {author}
          {role ? ` — ${role}` : ""}
        </figcaption>
      )}
    </figure>
  );
}

export function ButtonBlock({ node }: { node: PMNode }) {
  const label = String(node.attrs?.label ?? "ادامه");
  const href = String(node.attrs?.href ?? "#");
  const variant = String(node.attrs?.variant ?? "primary");
  const className =
    variant === "outline"
      ? "border border-brand bg-transparent text-brand hover:bg-brand/5"
      : variant === "secondary"
        ? "bg-muted text-foreground hover:bg-muted/80"
        : "bg-brand text-white hover:bg-brand/90";

  return (
    <div className="my-5">
      <a
        href={href}
        className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${className}`}
      >
        {label}
      </a>
    </div>
  );
}

export function DividerBlock({ node }: { node: PMNode }) {
  const style = String(node.attrs?.style ?? "brand");
  if (style === "dots") {
    return (
      <div className="my-8 flex items-center justify-center gap-2" aria-hidden>
        <span className="size-1.5 rounded-full bg-brand/40" />
        <span className="size-1.5 rounded-full bg-brand/70" />
        <span className="size-1.5 rounded-full bg-brand/40" />
      </div>
    );
  }
  if (style === "line") {
    return <hr className="my-8 border-border" />;
  }
  return (
    <div
      className="my-8 h-px w-full bg-gradient-to-l from-transparent via-brand/50 to-transparent"
      role="separator"
    />
  );
}

export function FileAttachment({ node }: { node: PMNode }) {
  const href = String(node.attrs?.href ?? "#");
  const fileName = String(node.attrs?.fileName ?? "file");
  const fileSize = String(node.attrs?.fileSize ?? "");

  return (
    <a
      href={href}
      className="my-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/40"
      download
    >
      <span className="font-medium text-foreground">{fileName}</span>
      {fileSize ? (
        <span className="text-muted-foreground">{fileSize}</span>
      ) : null}
    </a>
  );
}

export function VideoBlock({ node }: { node: PMNode }) {
  const src = String(node.attrs?.src ?? "");
  const poster = String(node.attrs?.poster ?? "");
  const caption = String(node.attrs?.caption ?? "");
  if (!src) {
    return (
      <div className="my-5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        ویدیو تنظیم نشده است
      </div>
    );
  }
  return (
    <figure className="my-5 overflow-hidden rounded-2xl border border-border/70">
      <video
        controls
        preload="metadata"
        poster={poster || undefined}
        className="aspect-video w-full bg-black"
        src={src}
      >
        <track kind="captions" />
      </video>
      {caption ? (
        <figcaption className="px-4 py-2 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function YoutubeEmbed({ node }: { node: PMNode }) {
  const raw = String(node.attrs?.src ?? "");
  if (!raw) return null;
  const src = toYoutubeEmbedUrl(raw);
  return (
    <div className="my-5 aspect-video overflow-hidden rounded-2xl border border-border/70">
      <iframe
        src={src}
        title="YouTube video"
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

function toYoutubeEmbedUrl(input: string): string {
  if (input.includes("youtube.com/embed/")) return input;
  try {
    const url = new URL(input);
    const id =
      url.searchParams.get("v") ||
      (url.hostname.includes("youtu.be")
        ? url.pathname.replace(/^\//, "")
        : "");
    if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    // fall through
  }
  return input;
}

export function ImageGallery({ node }: { node: PMNode }) {
  const images = (node.attrs?.images as Array<{
    src: string;
    alt: string;
    caption?: string;
  }>) ?? [];
  const columns = Number(node.attrs?.columns ?? 2);

  return (
    <div
      className="my-5 grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${Math.min(Math.max(columns, 1), 4)}, minmax(0, 1fr))`,
      }}
    >
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <figure key={`${img.src}-${i}`} className="overflow-hidden rounded-xl">
          <img
            src={img.src}
            alt={img.alt}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
          {img.caption ? (
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">
              {img.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

export function AccordionBlockView({ node }: { node: PMNode }) {
  const items = (node.attrs?.items as Array<{
    id: string;
    title: string;
    content: string;
  }>) ?? [];

  return (
    <div className="my-5 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
      {items.map((item) => (
        <details key={item.id} className="group px-4 py-3">
          <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none">
            {item.title}
          </summary>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {item.content}
          </p>
        </details>
      ))}
    </div>
  );
}

export function TabsBlockView({ node }: { node: PMNode }) {
  const items =
    (node.attrs?.items as Array<{
      id: string;
      label: string;
      content: string;
    }>) ?? [];
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const active = items.find((item) => item.id === activeId) ?? items[0];

  if (!items.length) return null;

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-border/70">
      <div
        className="flex flex-wrap gap-1 border-b border-border/70 bg-muted/30 p-2"
        role="tablist"
      >
        {items.map((item) => {
          const selected = item.id === active?.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                selected
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveId(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        className="p-4 text-sm leading-7 text-muted-foreground"
      >
        {active?.content}
      </div>
    </div>
  );
}

export function ColumnsView({
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  return (
    <div className="my-5 grid gap-4 md:grid-cols-2">{children}</div>
  );
}

export function ColumnView({
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  return <div className="min-w-0 space-y-2">{children}</div>;
}

export function Blockquote({
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  return (
    <blockquote className="my-5 border-s-4 border-brand/40 bg-muted/20 px-4 py-2 text-muted-foreground">
      {children}
    </blockquote>
  );
}

export function HorizontalRule() {
  return <hr className="my-8 border-border" />;
}

export function BulletList({ children }: { children?: ReactNode }) {
  return <ul className="my-4 list-disc space-y-1 ps-6 text-muted-foreground">{children}</ul>;
}

export function OrderedList({ children }: { children?: ReactNode }) {
  return (
    <ol className="my-4 list-decimal space-y-1 ps-6 text-muted-foreground">
      {children}
    </ol>
  );
}

export function ListItem({ children }: { children?: ReactNode }) {
  return <li className="leading-7">{children}</li>;
}

export function TaskList({ children }: { children?: ReactNode }) {
  return <ul className="my-4 space-y-2 ps-1">{children}</ul>;
}

export function TaskItem({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  const checked = Boolean(node.attrs?.checked);
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mt-1.5 size-4 rounded border-border"
        aria-checked={checked}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
