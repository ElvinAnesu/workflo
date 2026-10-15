import { formControlClass } from "@/components/form/form-control";

const PAGE_SIZES = [10, 20, 50, 100] as const;

type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function DataTablePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
      <p className="text-xs text-zinc-500">
        {totalCount === 0
          ? "0 results"
          : `Showing ${from}–${to} of ${totalCount}`}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className={formControlClass}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 text-xs text-zinc-600">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount || totalCount === 0}
            onClick={() => onPageChange(page + 1)}
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
