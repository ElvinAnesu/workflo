import { Menu } from "lucide-react";
import { HeaderActions } from "./header-actions";
import { HeaderIconButton } from "./header-icon-button";
import { HeaderLogo } from "./header-logo";
import { HeaderSearch } from "./header-search";

type HeaderProps = {
  onOpenMenu: () => void;
};

export function Header({ onOpenMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-3 sm:px-4 print:hidden">
      <div className="flex items-center gap-2">
        <HeaderIconButton label="Open menu" onClick={onOpenMenu} className="md:hidden">
          <Menu className="size-4" />
        </HeaderIconButton>
        <HeaderLogo />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="hidden sm:block">
          <HeaderSearch />
        </div>
        <HeaderActions />
      </div>
    </header>
  );
}
