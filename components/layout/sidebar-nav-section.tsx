import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type SidebarNavSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function SidebarNavSection({
  title,
  open,
  onToggle,
  children,
}: SidebarNavSectionProps) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-zinc-200 px-1 py-2 text-xs font-semibold text-zinc-500"
      >
        <span className="truncate">{title}</span>
        {open ? (
          <ChevronDown className="size-4 shrink-0" />
        ) : (
          <ChevronRight className="size-4 shrink-0" />
        )}
      </button>
      {open ? <div className="mt-2 flex flex-col gap-0.5">{children}</div> : null}
    </div>
  );
}
