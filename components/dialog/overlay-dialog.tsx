"use client";

import { useEffect, useState, type ReactNode } from "react";

const ANIMATION_MS = 220;

type OverlayDialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function OverlayDialog({ open, onClose, children }: OverlayDialogProps) {
  // Stays true while the closing animation plays, then the dialog unmounts.
  const [rendered, setRendered] = useState(open);

  if (open && !rendered) {
    setRendered(true);
  }

  useEffect(() => {
    if (open || !rendered) {
      return;
    }
    const timeout = window.setTimeout(() => setRendered(false), ANIMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [open, rendered]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!rendered) {
    return null;
  }

  // Opening animates from the `starting:` styles; closing animates to the
  // hidden styles before unmounting.
  return (
    <div className="absolute inset-0 z-20">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className={`absolute inset-0 rounded-lg bg-black/40 transition-opacity duration-[220ms] ease-out starting:opacity-0 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`absolute inset-2 flex min-h-0 origin-center flex-col overflow-hidden rounded-lg bg-white shadow-[0_12px_40px_rgba(16,24,40,0.18)] transition-[opacity,transform] duration-[220ms] ease-out starting:scale-[0.85] starting:opacity-0 sm:inset-4 ${
          open ? "scale-100 opacity-100" : "scale-[0.85] opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
