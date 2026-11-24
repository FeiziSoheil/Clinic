"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { CHEVRON, TRANSITION } from "@/lib/motion";

/**
 * shadcn-style Accordion built on top of Base UI's Accordion primitive
 * (the same base library the rest of this project's primitives use — see
 * `tabs.tsx`). Exposes the familiar shadcn API (`type="single" | "multiple"`
 * plus scalar/array `value`/`defaultValue`) and maps it onto Base UI's
 * `multiple` boolean + array-based value model.
 */

function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function Accordion({
  className,
  type = "single",
  defaultValue,
  value,
  ...props
}: Omit<
  AccordionPrimitive.Root.Props,
  "multiple" | "defaultValue" | "value"
> & {
  /** Whether one or multiple items can be open at a time. */
  type?: "single" | "multiple";
  /** The initially open item value(s). Accepts a scalar in single mode. */
  defaultValue?: string | string[];
  /** The controlled open item value(s). Accepts a scalar in single mode. */
  value?: string | string[];
}) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={type === "multiple"}
      defaultValue={toArray(defaultValue) as string[] | undefined}
      value={toArray(value) as string[] | undefined}
      className={cn("w-full", className)}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "group/accordion-item border-b last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header
      data-slot="accordion-header"
      className="flex"
    >
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          // RTL layout: the title is the FIRST flex child so it sits at the
          // inline-start edge (right edge in `dir="rtl"`) and is right-aligned
          // (`text-start` → right under RTL). The chevron is pushed to the
          // opposite (inline-end) edge via `ms-auto`, i.e. the left edge in RTL
          // — the conventional RTL accordion layout. Logical padding/margin are
          // used throughout so the component stays direction-agnostic.
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center gap-2 rounded-md ps-1 pe-2 py-4 text-start text-sm font-medium outline-none hover:bg-muted/60 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[panel-open]:bg-muted/40",
          TRANSITION.colors,
          className
        )}
        {...props}
      >
        <ChevronDownIcon className={cn("text-muted-foreground pointer-events-none size-4 shrink-0 group-data-[open]/accordion-item:rotate-180", CHEVRON)} />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    // Base UI's Accordion.Panel exposes:
    //   • `data-open`            — settled open state
    //   • `data-starting-style`  — applied during the enter (open) animation
    //   • `data-ending-style`    — applied during the exit (close) animation
    //   • `--accordion-panel-height` — CSS var holding the measured content
    //     height; Base UI keeps it in sync so we can transition height to it.
    // We drive BOTH height and opacity: open → full height + opacity 100,
    // entering/leaving → 0 height + opacity 0, ~250ms ease-out.
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "overflow-hidden text-sm transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none",
        // Settled (open) state: grow to the measured content height and reveal.
        "h-[var(--accordion-panel-height)] opacity-100",
        // Enter animation start frame.
        "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        // Exit animation end frame.
        "data-[ending-style]:h-0 data-[ending-style]:opacity-0",
        className
      )}
      {...props}
    >
      {/* Inner content wrapper: explicit RTL/right alignment + logical padding
          so everything rendered inside (forms, tables, text) stays right-aligned
          under `dir="rtl"`. */}
      <div dir="rtl" className="flex flex-col items-stretch gap-4 text-start ps-1 pe-2 pt-1 pb-4">
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
