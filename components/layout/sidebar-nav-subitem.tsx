import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SoonBadge } from "./soon-badge";

type SidebarNavSubitemProps = {
  icon: LucideIcon;
  label: string;
  href?: string;
  active?: boolean;
};

export function SidebarNavSubitem({
  icon: Icon,
  label,
  href,
  active = false,
}: SidebarNavSubitemProps) {
  const className = `flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
    active
      ? "bg-[#EEF0FA] font-medium text-zinc-800"
      : "text-zinc-600 hover:bg-zinc-50"
  }`;

  const content = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500">
        <Icon className="size-3.5" />
      </span>
      <span className="truncate">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <span
      aria-disabled="true"
      title="Not available yet"
      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400"
    >
      {content}
      <SoonBadge />
    </span>
  );
}
