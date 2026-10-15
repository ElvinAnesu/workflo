import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { DataTableColumn, DataTableSort } from "./data-table.types";

type DataTableHeaderProps<T> = {
  columns: DataTableColumn<T>[];
  sort: DataTableSort;
  onSort: (key: string) => void;
};

export function DataTableHeader<T>({
  columns,
  sort,
  onSort,
}: DataTableHeaderProps<T>) {
  return (
    <thead className="bg-zinc-50">
      <tr>
        {columns.map((column) => {
          const sortable = column.sortable !== false;
          const isActive = sort.key === column.key && sort.direction !== null;

          return (
            <th
              key={column.key}
              scope="col"
              onDoubleClick={() => {
                if (sortable) {
                  onSort(column.key);
                }
              }}
              className={`px-3 py-2.5 text-left text-xs font-semibold text-zinc-500 select-none ${
                sortable ? "cursor-pointer" : ""
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {column.label}
                {sortable ? (
                  isActive && sort.direction === "asc" ? (
                    <ArrowUp className="size-3.5 text-zinc-700" />
                  ) : isActive && sort.direction === "desc" ? (
                    <ArrowDown className="size-3.5 text-zinc-700" />
                  ) : (
                    <ArrowUpDown className="size-3.5 text-zinc-300" />
                  )
                ) : null}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
