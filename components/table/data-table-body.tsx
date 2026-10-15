import type { DataTableColumn } from "./data-table.types";

type DataTableBodyProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
};

function cellValue<T>(row: T, key: string) {
  const value = (row as Record<string, unknown>)[key];

  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

export function DataTableBody<T>({ columns, rows }: DataTableBodyProps<T>) {
  if (rows.length === 0) {
    return <tbody />;
  }

  return (
    <tbody>
      {rows.map((row, rowIndex) => {
        const rowRecord = row as Record<string, unknown>;
        const rowKey =
          typeof rowRecord.id === "string" || typeof rowRecord.id === "number"
            ? String(rowRecord.id)
            : String(rowIndex);

        return (
          <tr key={rowKey} className="border-t border-zinc-100">
            {columns.map((column) => (
              <td
                key={column.key}
                className="px-3 py-2.5 text-xs whitespace-nowrap text-zinc-700"
              >
                {column.render
                  ? column.render(row, rowIndex)
                  : cellValue(row, column.key)}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}
