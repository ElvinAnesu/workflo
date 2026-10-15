import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc" | null;

export type DataTableColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T, rowIndex: number) => ReactNode;
  // Value written to exports; defaults to row[key]. false leaves the column out.
  exportValue?: ((row: T) => string | number) | false;
};

export type DataTableSort = {
  key: string | null;
  direction: SortDirection;
};
