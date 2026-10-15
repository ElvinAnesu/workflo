import type { ReactNode } from "react";
import { DataTableSearch } from "./data-table-search";

type DataTableToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
};

export function DataTableToolbar({
  search,
  onSearch,
  searchPlaceholder,
  actions,
}: DataTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DataTableSearch
        value={search}
        onSearch={onSearch}
        placeholder={searchPlaceholder}
      />
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
