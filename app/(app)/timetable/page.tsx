import { TimetableTable } from "@/components/timetable/timetable-table";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listTimetable, listTimetableFormOptions } from "@/server/timetable";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TimetablePage({
  searchParams,
}: PageProps<"/timetable">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "pattern";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "pattern",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, options] = await Promise.all([
    listTimetable({
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "pattern",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    }),
    listTimetableFormOptions(),
  ]);

  return (
    <TimetableTable
      rows={rows}
      totalCount={totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      shifts={options.shifts}
      departments={options.departments}
    />
  );
}
