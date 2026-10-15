import type { DataTableSort } from "@/components/table/data-table.types";

type ClientTableQuery<T> = {
  search: string;
  searchKeys: (keyof T)[];
  sort: DataTableSort;
  page: number;
  pageSize: number;
};

// Search, sort and paginate rows held on the client, for tables whose data is
// not coming from a paginated API yet.
export function queryClientRows<T>(
  rows: T[],
  { search, searchKeys, sort, page, pageSize }: ClientTableQuery<T>,
) {
  const term = search.trim().toLowerCase();
  const filtered = term
    ? rows.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(term),
        ),
      )
    : rows;

  const sorted =
    sort.key && sort.direction
      ? [...filtered].sort((a, b) => {
          const key = sort.key as keyof T;
          const result = String(a[key] ?? "").localeCompare(
            String(b[key] ?? ""),
            undefined,
            { numeric: true, sensitivity: "base" },
          );
          return sort.direction === "asc" ? result : -result;
        })
      : filtered;

  const start = (page - 1) * pageSize;

  return {
    rows: sorted.slice(start, start + pageSize),
    totalCount: sorted.length,
    allRows: sorted,
  };
}
