import { Bell, Bookmark, Calendar, LayoutGrid, Plus } from "lucide-react";
import { HeaderIconButton } from "./header-icon-button";
import { HeaderUser } from "./header-user";

export function HeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 md:flex">
      <HeaderIconButton label="Apps">
        <LayoutGrid className="size-4" />
      </HeaderIconButton>
      <HeaderIconButton label="Add">
        <Plus className="size-4" />
      </HeaderIconButton>
      <HeaderIconButton label="Calendar">
        <Calendar className="size-4" />
      </HeaderIconButton>
      <HeaderIconButton label="Notifications">
        <Bell className="size-4" />
      </HeaderIconButton>
      <HeaderIconButton label="Saved">
        <Bookmark className="size-4" />
      </HeaderIconButton>
      </div>
      <HeaderUser />
    </div>
  );
}
