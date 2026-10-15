import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SidebarNavGroupProps = {
  icon: LucideIcon;
  label: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

export function SidebarNavGroup({
  icon: Icon,
  label,
  open,
  onToggle,
  children,
}: SidebarNavGroupProps) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-zinc-400" />
        )}
      </button>
      {open && children ? (
        <div className="mt-0.5 ml-5 flex flex-col border-l border-zinc-200 pl-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
