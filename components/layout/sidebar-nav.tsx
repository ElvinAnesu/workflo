"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session/session-context";
import { isActivePath, visibleNavSections } from "./nav-config";
import { SidebarNavGroup } from "./sidebar-nav-group";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarNavSection } from "./sidebar-nav-section";
import { SidebarNavSubitem } from "./sidebar-nav-subitem";
import {
  saveSidebarState,
  type SidebarOpenState,
} from "./sidebar-state";

type SidebarNavProps = {
  collapsed: boolean;
  initialOpenState: SidebarOpenState;
};

export function SidebarNav({ collapsed, initialOpenState }: SidebarNavProps) {
  const pathname = usePathname();
  const sections = visibleNavSections(useSession()?.access);
  const [openState, setOpenState] =
    useState<SidebarOpenState>(initialOpenState);

  function isOpen(key: string) {
    return openState[key] ?? true;
  }

  function toggle(key: string) {
    setOpenState((current) => ({ ...current, [key]: !(current[key] ?? true) }));
  }

  useEffect(() => {
    saveSidebarState(openState);
  }, [openState]);

  if (collapsed) {
    return (
      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pt-1 pb-2">
        {sections.map((section, sectionIndex) => (
          <div key={section.key} className="flex flex-col items-center gap-1">
            {sectionIndex > 0 ? <span className="my-1 h-px w-6 bg-zinc-200" /> : null}
            {section.entries
              .flatMap((entry) => (entry.kind === "group" ? entry.items : [entry]))
              .filter((link) => link.href)
              .map((link) => {
                const active = isActivePath(pathname, link.href!);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href!}
                    title={link.label}
                    aria-label={link.label}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                      active ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
                    }`}
                  >
                    <Icon className="size-4" />
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <div className="flex flex-col gap-3">
        {sections.map((section) => (
          <SidebarNavSection
            key={section.key}
            title={section.title}
            open={isOpen(section.key)}
            onToggle={() => toggle(section.key)}
          >
            {section.entries.map((entry) =>
              entry.kind === "item" ? (
                <SidebarNavItem
                  key={entry.label}
                  href={entry.href}
                  icon={entry.icon}
                  label={entry.label}
                  active={entry.href ? isActivePath(pathname, entry.href) : false}
                />
              ) : (
                <SidebarNavGroup
                  key={entry.key}
                  icon={entry.icon}
                  label={entry.label}
                  open={isOpen(entry.key)}
                  onToggle={() => toggle(entry.key)}
                >
                  {entry.items.map((link) => (
                    <SidebarNavSubitem
                      key={link.label}
                      icon={link.icon}
                      label={link.label}
                      href={link.href}
                      active={link.href ? isActivePath(pathname, link.href) : false}
                    />
                  ))}
                </SidebarNavGroup>
              ),
            )}
          </SidebarNavSection>
        ))}
      </div>
    </nav>
  );
}
