"use client";

import { useState } from "react";
import { queryClientRows } from "@/components/table/client-table-query";
import type { DataTableSort } from "@/components/table/data-table.types";

const PAGE_SIZE_DEFAULT = 10;

// Search, sort and pagination state for a DataTable whose rows live on the
// client. Spread the result into <DataTable />.
export function useClientTable<T>(rows: T[], searchKeys: (keyof T)[]) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [sort, setSort] = useState<DataTableSort>({ key: null, direction: null });

  const result = queryClientRows(rows, {
    search,
    searchKeys,
    sort,
    page,
    pageSize,
  });

  return {
    rows: result.rows,
    totalCount: result.totalCount,
    // Every row matching the search, in sort order (for exports).
    allRows: result.allRows,
    page,
    pageSize,
    search,
    sort,
    onSearch: (value: string) => {
      setSearch(value);
      setPage(1);
    },
    onSort: (key: string) => {
      setPage(1);
      setSort((current) => {
        if (current.key !== key) {
          return { key, direction: "asc" };
        }
        if (current.direction === "asc") {
          return { key, direction: "desc" };
        }
        return { key: null, direction: null };
      });
    },
    onPageChange: setPage,
    onPageSizeChange: (nextSize: number) => {
      setPageSize(nextSize);
      setPage(1);
    },
    resetPage: () => setPage(1),
  };
}
