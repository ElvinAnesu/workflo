import { X } from "lucide-react";
import { HeaderIconButton } from "./header-icon-button";
import { SidebarCollapseButton } from "./sidebar-collapse-button";
import { SidebarNav } from "./sidebar-nav";
import { SidebarOrgSwitcher } from "./sidebar-org-switcher";
import type { SidebarOpenState } from "./sidebar-state";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  initialOpenState: SidebarOpenState;
  // "drawer" is the slide-in menu used on small screens.
  variant?: "docked" | "drawer";
};

export function Sidebar({
  collapsed,
  onToggle,
  initialOpenState,
  variant = "docked",
}: SidebarProps) {
  const drawer = variant === "drawer";

  return (
    <aside
      className={`h-full shrink-0 flex-col overflow-hidden border-r border-zinc-200/80 bg-white transition-[width] duration-200 ease-out print:hidden ${
        drawer ? "flex" : "hidden md:flex"
      }`}
      style={{ width: collapsed ? 72 : 260 }}
    >
      <div className={collapsed ? "flex justify-center p-2" : "flex items-center gap-2 p-3"}>
        <SidebarOrgSwitcher collapsed={collapsed} />
        {drawer ? (
          <HeaderIconButton label="Close menu" onClick={onToggle}>
            <X className="size-4" />
          </HeaderIconButton>
        ) : null}
      </div>
      <SidebarNav collapsed={collapsed} initialOpenState={initialOpenState} />
      {drawer ? null : (
        <div
          className={`mt-auto ${collapsed ? "flex justify-center p-2" : "flex justify-end p-3"}`}
        >
          <SidebarCollapseButton collapsed={collapsed} onToggle={onToggle} />
        </div>
      )}
    </aside>
  );
}
