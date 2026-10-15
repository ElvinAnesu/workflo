import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeaderIconButton } from "./header-icon-button";

type SidebarCollapseButtonProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export function SidebarCollapseButton({
  collapsed,
  onToggle,
}: SidebarCollapseButtonProps) {
  return (
    <HeaderIconButton
      label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={onToggle}
    >
      {collapsed ? (
        <ChevronRight className="size-4" />
      ) : (
        <ChevronLeft className="size-4" />
      )}
    </HeaderIconButton>
  );
}
