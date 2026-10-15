"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { formControlSearchClass } from "@/components/form/form-control";

type DataTableSearchProps = {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
};

export function DataTableSearch({
  value,
  onSearch,
  placeholder = "Search…",
}: DataTableSearchProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  // Follow changes made from outside (e.g. a reset) without an extra effect.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (draft !== value) {
        onSearch(draft);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [draft, onSearch, value]);

  return (
    <label className="relative block min-w-0 w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className={formControlSearchClass}
      />
    </label>
  );
}
