"use client";

/**
 * MedicineSearchInput — the search text field for the medicine combobox.
 *
 * A controlled, presentational input (the parent {@link MedicineSearchCombobox}
 * owns the query string + the debounce). It renders a search glyph on the
 * trailing edge (RTL) and a spinner on the leading edge while a query is in
 * flight, plus an optional clear button.
 *
 * Per the spec the parent must own the query state, so this component emits
 * every keystroke via {@link MedicineSearchInputProps.onValueChange}; the
 * combobox debounces that into the React Query lookup.
 */

import { Loader2, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MedicineSearchInputProps
  extends Omit<
    React.ComponentProps<"input">,
    "value" | "onChange" | "ref"
  > {
  /** Current (immediate) text value. */
  value: string;
  /** Emitted on every keystroke. */
  onValueChange: (value: string) => void;
  /** Show the loading spinner and hide the clear button. */
  loading?: boolean;
  /** Show the clear (X) button when there is text (defaults to `true`). */
  clearable?: boolean;
  /** Optional ref forwarded to the underlying `<input>`. */
  inputRef?: React.Ref<HTMLInputElement>;
}

export function MedicineSearchInput({
  value,
  onValueChange,
  loading = false,
  clearable = true,
  inputRef,
  className,
  ...props
}: MedicineSearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Trailing search glyph (RTL). */}
      <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={value}
        className="h-9 pr-9 pl-9"
        onChange={(e) => onValueChange(e.target.value)}
        {...props}
      />

      {/* Leading affordance: spinner while loading, else a clear button. */}
      {loading ? (
        <Loader2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : clearable && value.length > 0 ? (
        <button
          type="button"
          aria-label="پاک کردن"
          className="absolute top-1/2 left-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => onValueChange("")}
          tabIndex={-1}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
