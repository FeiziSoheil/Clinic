"use client";

import { useEffect, useRef } from "react";

/**
 * Debounced autosave hook. Calls `onSave` after `delayMs` of inactivity.
 * Ready for revision snapshots — pass a save that also calls RevisionService.
 */
export function useAutosave(
  payloadKey: string,
  onSave: () => void | Promise<void>,
  enabled: boolean,
  delayMs = 2500,
): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveRef.current();
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [payloadKey, enabled, delayMs]);
}
