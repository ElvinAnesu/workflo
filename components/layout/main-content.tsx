import type { ReactNode } from "react";
import { OverlayDialogProvider } from "@/components/dialog/overlay-dialog-provider";

type MainContentProps = {
  children: ReactNode;
};

export function MainContent({ children }: MainContentProps) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-4 print:block print:p-0">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white p-3 sm:p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] print:block print:overflow-visible print:border-0 print:p-0 print:shadow-none">
        <OverlayDialogProvider>
          <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
            {children}
          </div>
        </OverlayDialogProvider>
      </div>
    </main>
  );
}
