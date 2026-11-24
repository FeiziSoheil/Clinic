"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PanelDrawerPayload = {
  title: string;
  description?: string;
  content: ReactNode;
};

export type PanelDrawerContextValue = {
  open: boolean;
  title: string;
  description?: string;
  content: ReactNode | null;
  openDrawer: (payload: PanelDrawerPayload) => void;
  closeDrawer: () => void;
};

const PanelDrawerContext = createContext<PanelDrawerContextValue | null>(null);

export function PanelDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | undefined>();
  const [content, setContent] = useState<ReactNode | null>(null);

  // Only flip `open` — keep title/content mounted so the exit slide can finish.
  const closeDrawer = useCallback(() => {
    setOpen(false);
  }, []);

  const openDrawer = useCallback((payload: PanelDrawerPayload) => {
    setTitle(payload.title);
    setDescription(payload.description);
    setContent(payload.content);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ open, title, description, content, openDrawer, closeDrawer }),
    [open, title, description, content, openDrawer, closeDrawer],
  );

  return (
    <PanelDrawerContext.Provider value={value}>
      {children}
    </PanelDrawerContext.Provider>
  );
}

export function usePanelDrawer(): PanelDrawerContextValue {
  const ctx = useContext(PanelDrawerContext);
  if (!ctx) {
    throw new Error("usePanelDrawer must be used within PanelDrawerProvider");
  }
  return ctx;
}
