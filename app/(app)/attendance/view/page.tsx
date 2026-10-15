import { ViewAttendanceTable } from "@/components/attendance/view-attendance-table";
import { ATTENDANCE_STATUSES } from "@/components/attendance/attendance.types";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listAttendance, listAttendanceOptions } from "@/server/attendance";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ViewAttendancePage({
  searchParams,
}: PageProps<"/attendance/view">) {
  const params = await searchParams;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthParam = firstParam(params.month);
  const month = monthParam === undefined ? currentMonth : monthParam;
  const statusParam = firstParam(params.status) ?? "";
  const status = (ATTENDANCE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "date";
  const dir = firstParam(params.dir);
  const defaultDirection = "desc";
  const sortDirection = firstParam(params.sort) ? (dir === "asc" ? "asc" : "desc") : defaultDirection;
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "date",
    direction: sortDirection,
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, options] = await Promise.all([
    listAttendance({
      month: /^\d{4}-\d{2}$/.test(month) ? month : "",
      status,
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "date",
      sortDirection,
    }),
    listAttendanceOptions(),
  ]);

  return (
    <ViewAttendanceTable
      rows={rows}
      totalCount={totalCount}
      month={month}
      status={status}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      shifts={options.shifts}
      employees={options.employees}
    />
  );
}
