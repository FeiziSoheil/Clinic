"use client";

import { useRef, type MouseEvent } from "react";

import type { TocEntry } from "@/cms/utils/toc";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { cn } from "@/lib/utils";

import { ArticleSidebarMeta, type ArticleSidebarMetaProps } from "./ArticleSidebarMeta";
import { scrollTocItemIntoView } from "./toc-scroll";
import { useTocAutoScroll } from "./useTocAutoScroll";

export interface ArticleSidebarProps extends ArticleSidebarMetaProps {
  items: TocEntry[];
}

export function ArticleSidebar({ items, ...meta }: ArticleSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sectionIds = items.map((item) => item.id);
  const activeId = useScrollSpy(sectionIds);

  useTocAutoScroll(activeId, listRef);

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });

    const container = listRef.current;
    const activeEl = container?.querySelector<HTMLElement>(
      `[data-toc-id="${CSS.escape(id)}"]`,
    );
    if (container && activeEl) {
      scrollTocItemIntoView(container, activeEl);
    }
  }

  return (
    <aside className="hidden min-w-0 lg:block">
      <div className="sticky top-[90px] flex w-full max-h-[calc(100vh-90px)] flex-col gap-3">
        <ArticleSidebarMeta {...meta} />

        {items.length > 0 ? (
          <nav
            aria-label="فهرست مطالب"
            className="flex min-h-0 flex-col rounded-2xl border border-border/70 bg-card p-4 lg:p-5"
          >
            <p className="mb-3 shrink-0 text-sm font-semibold">فهرست مطالب</p>
            <div
              ref={listRef}
              className="no-scrollbar min-h-0 max-h-[min(550px,calc(100vh-20rem))] overflow-x-hidden overflow-y-auto overscroll-y-contain"
            >
              <ul className="space-y-1 text-sm">
                {items.map((item) => {
                  const isActive = activeId === item.id;
                  return (
                    <li
                      key={item.id}
                      className="min-w-0"
                      style={{ paddingInlineStart: (item.level - 1) * 10 }}
                    >
                      <a
                        href={`#${item.id}`}
                        data-toc-id={item.id}
                        title={item.text}
                        aria-current={isActive ? "location" : undefined}
                        onClick={(event) => handleClick(event, item.id)}
                        className={cn(
                          "block truncate whitespace-nowrap rounded-md px-2 py-1.5",
                          isActive
                            ? "border-e-2 border-primary bg-primary/10 font-semibold text-primary"
                            : "text-muted-foreground hover:text-primary",
                        )}
                      >
                        {item.text}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        ) : null}
      </div>
    </aside>
  );
}
