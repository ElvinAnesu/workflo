"use client";

import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { switchCompanyAction } from "@/app/(app)/company/actions";
import { useSession } from "@/components/session/session-context";

type SidebarOrgSwitcherProps = {
  collapsed?: boolean;
};

export function SidebarOrgSwitcher({ collapsed = false }: SidebarOrgSwitcherProps) {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const companies = session?.companies ?? [];
  const current = session?.company;
  const name = current?.name || "Set up company";
  const showMenu = companies.length > 1;
  const singleHref = current ? "/company" : "/manage-companies";

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function handleSwitch(companyId: number, isActive: boolean) {
    if (!isActive) {
      return;
    }
    setOpen(false);
    const result = await switchCompanyAction(companyId);
    if ("error" in result && result.error) {
      return;
    }
    router.refresh();
  }

  if (!showMenu) {
    if (collapsed) {
      return (
        <Link
          href={singleHref}
          title={name}
          aria-label={name}
          className="flex size-9 items-center justify-center rounded-lg bg-[#EEF0FA] text-zinc-700"
        >
          <Building2 className="size-4" />
        </Link>
      );
    }

    return (
      <Link
        href={singleHref}
        title="Company settings"
        className="flex w-full items-center gap-3 rounded-lg bg-[#EEF0FA] px-3 py-2.5 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-600">
          <Building2 className="size-4" />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-xs font-semibold ${
            current ? "text-zinc-800" : "text-[#1E40AF]"
          }`}
        >
          {name}
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={name}
        onClick={() => setOpen((value) => !value)}
        className={
          collapsed
            ? "flex size-9 items-center justify-center rounded-lg bg-[#EEF0FA] text-zinc-700"
            : "flex w-full items-center gap-3 rounded-lg bg-[#EEF0FA] px-3 py-2.5 text-left"
        }
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-white text-zinc-600 ${
            collapsed ? "size-9" : "size-9"
          }`}
        >
          <Building2 className="size-4" />
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-800">
              {name}
            </span>
            <ChevronRight
              className={`size-4 shrink-0 text-zinc-400 transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
          </>
        )}
      </button>
      {open ? (
        <div
          role="listbox"
          className={`absolute z-30 rounded-md border border-zinc-200 bg-white py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)] ${
            collapsed ? "left-full top-0 ml-2 w-56" : "left-0 right-0 top-full mt-1"
          }`}
        >
          {companies.map((company) => {
            const selected = current?.id === company.id;
            const disabled = !company.isActive;
            return (
              <button
                key={company.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => {
                  void handleSwitch(company.id, company.isActive);
                }}
                className={`flex w-full px-3 py-1.5 text-left text-xs ${
                  disabled
                    ? "cursor-not-allowed text-zinc-400"
                    : selected
                      ? "bg-[#EEF0FA] font-medium text-zinc-800"
                      : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{company.name}</span>
                {disabled ? (
                  <span className="ml-2 shrink-0 text-[10px] uppercase">
                    Inactive
                  </span>
                ) : null}
              </button>
            );
          })}
          <Link
            href="/manage-companies"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-zinc-100 px-3 py-1.5 text-xs font-medium text-[#1E40AF]"
          >
            Manage companies
          </Link>
        </div>
      ) : null}
    </div>
  );
}
