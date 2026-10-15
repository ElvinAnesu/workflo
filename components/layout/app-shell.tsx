"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { ConfirmDialogProvider } from "@/components/dialog/confirm-dialog-provider";
import { Header } from "./header";
import { MainContent } from "./main-content";
import { Sidebar } from "./sidebar";
import type { SidebarOpenState } from "./sidebar-state";

type AppShellProps = {
  children: ReactNode;
  initialSidebarState: SidebarOpenState;
};

export function AppShell({ children, initialSidebarState }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu once a link inside it is followed.
  function handleDrawerClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setMobileOpen(false);
    }
  }

  return (
    <ConfirmDialogProvider>
    <div className="flex h-full min-h-0 flex-col bg-[#F4F6FB] print:block print:h-auto print:bg-white">
      <Header onOpenMenu={() => setMobileOpen(true)} />
      <div className="flex min-h-0 flex-1 print:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((current) => !current)}
          initialOpenState={initialSidebarState}
        />
        <MainContent>{children}</MainContent>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative h-full w-fit" onClick={handleDrawerClick}>
            <Sidebar
              variant="drawer"
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              initialOpenState={initialSidebarState}
            />
          </div>
        </div>
      ) : null}
    </div>
    </ConfirmDialogProvider>
  );
}
