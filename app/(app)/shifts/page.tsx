import { ShiftsTable } from "@/components/shifts/shifts-table";
import { listShiftFormOptions, listShifts } from "@/server/shifts";
import type { DataTableSort } from "@/components/table/data-table.types";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShiftsPage({
  searchParams,
}: PageProps<"/shifts">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "shiftName";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "shiftName",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, options] = await Promise.all([
    listShifts({
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "shiftName",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    }),
    listShiftFormOptions(),
  ]);

  return (
    <ShiftsTable
      rows={rows}
      totalCount={totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      branches={options.branches}
      departments={options.departments}
    />
  );
}
