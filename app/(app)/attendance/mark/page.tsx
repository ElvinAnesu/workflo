import { MarkAttendanceTable } from "@/components/attendance/mark-attendance-table";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listAttendanceOptions, listMarkAttendance } from "@/server/attendance";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export default async function MarkAttendancePage({
  searchParams,
}: PageProps<"/attendance/mark">) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = firstParam(params.date);
  const date = dateParam === undefined ? today : dateParam;
  const shiftId = positiveId(firstParam(params.shift));
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? "employee" : "employee",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [listed, options] = await Promise.all([
    shiftId
      ? listMarkAttendance({
          workDate: date,
          shiftId,
          search,
          page,
          pageSize: size,
          sortDirection,
        })
      : Promise.resolve({ rows: [], totalCount: 0, scheduledCount: 0 }),
    listAttendanceOptions(),
  ]);

  return (
    <MarkAttendanceTable
      date={date}
      shiftId={shiftId}
      shifts={options.shifts}
      rows={listed.rows}
      totalCount={listed.totalCount}
      scheduledCount={listed.scheduledCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
    />
  );
}
