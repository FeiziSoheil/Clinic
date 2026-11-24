"use client";

import Image from "next/image";

import type { PMNode } from "../../types/document";

export function ArticleImage({ node }: { node: PMNode }) {
  const src = String(node.attrs?.src ?? "");
  const alt = String(node.attrs?.alt ?? "");
  const title = node.attrs?.title ? String(node.attrs.title) : undefined;
  if (!src) return null;

  const isRemote = src.startsWith("http") || src.startsWith("blob:");

  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
      <div className="relative aspect-[16/9] w-full">
        {isRemote ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/remote upload preview
          <img
            src={src}
            alt={alt}
            title={title}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            title={title}
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover"
            placeholder="empty"
          />
        )}
      </div>
      {alt ? (
        <figcaption className="px-4 py-2 text-center text-sm text-muted-foreground">
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}
