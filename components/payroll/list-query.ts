import type { DataTableSort } from "@/components/table/data-table.types";

export function payrollQuery(values: {
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  extra?: Record<string, string>;
}) {
  const params = new URLSearchParams();
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  for (const [key, value] of Object.entries(values.extra ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function nextSort(sort: DataTableSort, key: string): DataTableSort {
  if (sort.key !== key) {
    return { key, direction: "asc" };
  }
  if (sort.direction === "asc") {
    return { key, direction: "desc" };
  }
  return { key: null, direction: null };
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function readListParams(params: Record<string, string | string[] | undefined>) {
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "";
  const dir = firstParam(params.dir);
  const sort: DataTableSort = sortKey
    ? { key: sortKey, direction: dir === "desc" ? "desc" : "asc" }
    : { key: null, direction: null };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;
  return {
    search,
    page,
    pageSize: size,
    sort,
    sortKey,
    sortDirection: sort.direction === "desc" ? ("desc" as const) : ("asc" as const),
    status: firstParam(params.status) ?? "",
  };
}
