import { LeaveTypesTable } from "@/components/leave-types/leave-types-table";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listLeaveFormOptions, listLeaveTypes } from "@/server/leave";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeaveTypesPage({
  searchParams,
}: PageProps<"/leave-types">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "leaveTypeName";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "leaveTypeName",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;
  const [listed, options] = await Promise.all([
    listLeaveTypes({
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "leaveTypeName",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    }),
    listLeaveFormOptions(),
  ]);

  return (
    <LeaveTypesTable
      rows={listed.rows}
      totalCount={listed.totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      departments={options.departments}
    />
  );
}
