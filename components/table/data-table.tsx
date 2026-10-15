"use client";

import type { ReactNode } from "react";
import { DataTableBody } from "./data-table-body";
import { DataTableHeader } from "./data-table-header";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import type { DataTableColumn, DataTableSort } from "./data-table.types";

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  search: string;
  sort: DataTableSort;
  onSearch: (value: string) => void;
  onSort: (key: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  actions?: ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  totalCount,
  page,
  pageSize,
  search,
  sort,
  onSearch,
  onSort,
  onPageChange,
  onPageSizeChange,
  searchPlaceholder,
  emptyMessage = "No results",
  actions,
}: DataTableProps<T>) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <DataTableToolbar
        search={search}
        onSearch={onSearch}
        searchPlaceholder={searchPlaceholder}
        actions={actions}
      />
      <div className="overflow-hidden rounded-md border border-zinc-200">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <DataTableHeader columns={columns} sort={sort} onSort={onSort} />
            <DataTableBody columns={columns} rows={rows} />
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="border-t border-zinc-200 px-3 py-12 text-center text-xs text-zinc-500">
            {emptyMessage}
          </p>
        ) : null}
      </div>
      <DataTablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
