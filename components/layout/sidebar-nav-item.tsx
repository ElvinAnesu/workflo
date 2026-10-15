import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SoonBadge } from "./soon-badge";

type SidebarNavItemProps = {
  href?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed?: boolean;
};

export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active = false,
  collapsed = false,
}: SidebarNavItemProps) {
  const collapsedClass = `flex size-9 items-center justify-center rounded-md ${
    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
  }`;
  const expandedClass = `flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-xs ${
    active
      ? "bg-[#EEF0FA] font-medium text-zinc-800"
      : "text-zinc-700 hover:bg-zinc-50"
  }`;

  const iconBox = (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      <Icon className="size-4" />
    </span>
  );

  if (collapsed) {
    if (href) {
      return (
        <Link href={href} aria-label={label} className={collapsedClass}>
          <Icon className="size-4" />
        </Link>
      );
    }

    return (
      <span aria-label={label} className={collapsedClass}>
        <Icon className="size-4" />
      </span>
    );
  }

  if (href) {
    return (
      <Link href={href} className={expandedClass}>
        {iconBox}
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <span
      aria-disabled="true"
      title="Not available yet"
      className="flex w-full cursor-default items-center gap-3 rounded-md px-2 py-2 text-left text-xs text-zinc-400"
    >
      {iconBox}
      <span className="truncate">{label}</span>
      <SoonBadge />
    </span>
  );
}
