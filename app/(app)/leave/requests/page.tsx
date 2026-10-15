import { LeaveRequestsTable } from "@/components/leave-requests/leave-requests-table";
import { LEAVE_REQUEST_STATUSES } from "@/components/leave-requests/leave-request.types";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listLeaveFormOptions, listLeaveRequests } from "@/server/leave";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeaveRequestsPage({
  searchParams,
}: PageProps<"/leave/requests">) {
  const params = await searchParams;
  const statusParam = firstParam(params.status) ?? "";
  const status = (LEAVE_REQUEST_STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "startDate";
  const dir = firstParam(params.dir);
  const sortDirection = firstParam(params.sort) ? (dir === "asc" ? "asc" : "desc") : "desc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "startDate",
    direction: sortDirection,
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, options] = await Promise.all([
    listLeaveRequests({
      status,
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "startDate",
      sortDirection,
    }),
    listLeaveFormOptions(),
  ]);

  return (
    <LeaveRequestsTable
      rows={rows}
      totalCount={totalCount}
      status={status}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      employees={options.employees}
    />
  );
}
