"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type KeyboardEvent } from "react";
import { formControlSearchClass } from "@/components/form/form-control";
import { useSession } from "@/components/session/session-context";
import { can, featureForPath } from "@/lib/access";
import { flatNavLinks } from "./nav-config";

export function HeaderSearch() {
  const router = useRouter();
  const access = useSession()?.access;
  const links = flatNavLinks().filter((link) => {
    const feature = featureForPath(link.href);
    return Boolean(feature && can(access, feature, "view"));
  });
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const term = query.trim().toLowerCase();
  const results = term
    ? links.filter((link) =>
        `${link.label} ${link.trail}`.toLowerCase().includes(term),
      ).slice(0, 8)
    : [];

  function go(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[highlighted]) {
      event.preventDefault();
      go(results[highlighted].href);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-72">
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Search menus…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className={formControlSearchClass}
        />
      </label>
      {open && term ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">No menus match “{query}”</li>
          ) : (
            results.map((link, index) => {
              const Icon = link.icon;
              return (
                <li key={link.href} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(link.href)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                      index === highlighted ? "bg-[#EEF0FA]" : ""
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0 text-zinc-500" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-zinc-800">{link.label}</span>
                      <span className="truncate text-[11px] text-zinc-500">{link.trail}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
