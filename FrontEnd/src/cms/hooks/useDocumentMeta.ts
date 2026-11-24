"use client";

import { useMemo } from "react";

import type { PMDocument } from "../types/document";
import { buildToc, type TocEntry } from "../utils/toc";
import { estimateReadingMinutes } from "../utils/reading-time";

export function useToc(content: PMDocument | null | undefined): TocEntry[] {
  return useMemo(
    () => (content ? buildToc(content) : []),
    [content],
  );
}

export function useReadingTime(
  content: PMDocument | null | undefined,
): number {
  return useMemo(
    () => (content ? estimateReadingMinutes(content) : 1),
    [content],
  );
}
