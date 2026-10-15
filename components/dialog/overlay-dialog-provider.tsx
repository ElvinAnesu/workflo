"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { OverlayDialog } from "@/components/dialog/overlay-dialog";

type OverlayDialogContextValue = {
  show: (content: ReactNode) => void;
  close: () => void;
};

const OverlayDialogContext = createContext<OverlayDialogContextValue | null>(
  null,
);

type OverlayDialogProviderProps = {
  children: ReactNode;
};

export function OverlayDialogProvider({ children }: OverlayDialogProviderProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ReactNode>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const show = useCallback((nextContent: ReactNode) => {
    setContent(nextContent);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      show,
      close,
    }),
    [show, close],
  );

  return (
    <OverlayDialogContext.Provider value={value}>
      {children}
      <OverlayDialog open={open} onClose={close}>
        {content}
      </OverlayDialog>
    </OverlayDialogContext.Provider>
  );
}

export function useOverlayDialog() {
  const context = useContext(OverlayDialogContext);

  if (!context) {
    throw new Error("useOverlayDialog must be used within OverlayDialogProvider");
  }

  return context;
}
