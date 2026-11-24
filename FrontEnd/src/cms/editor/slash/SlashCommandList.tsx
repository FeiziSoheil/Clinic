"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type KeyboardEvent,
} from "react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

import { cn } from "@/lib/utils";
import type { SlashCommandItem } from "../../constants/slash-items";

export interface SlashCommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export type SlashCommandListProps = SuggestionProps<SlashCommandItem>;

/**
 * Keyboard-navigable slash menu rendered by the TipTap suggestion plugin.
 */
export const SlashCommandList = forwardRef<
  SlashCommandListRef,
  SlashCommandListProps
>(function SlashCommandList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="cms-slash-menu rounded-xl border border-border bg-popover p-3 text-sm text-muted-foreground shadow-lg">
        موردی یافت نشد
      </div>
    );
  }

  return (
    <div
      className="cms-slash-menu max-h-72 w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg"
      role="listbox"
      aria-label="دستورات اسلش"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const active = index === selectedIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={active}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors",
              active
                ? "bg-brand/10 text-foreground"
                : "text-foreground hover:bg-muted/60",
            )}
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                command(item);
              }
            }}
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background text-brand">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="block text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
});
