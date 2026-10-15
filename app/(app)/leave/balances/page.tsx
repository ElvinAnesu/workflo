import { LeaveBalancesTable } from "@/components/leave-balances/leave-balances-table";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listLeaveBalanceYears, listLeaveBalances } from "@/server/leave";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeaveBalancesPage({
  searchParams,
}: PageProps<"/leave/balances">) {
  const params = await searchParams;
  const currentYear = Number(new Date().toISOString().slice(0, 4));
  const yearParam = firstParam(params.year);
  const parsedYear = Number(yearParam);
  const year =
    yearParam === undefined
      ? currentYear
      : Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
        ? parsedYear
        : null;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "employee";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "employee",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, years] = await Promise.all([
    listLeaveBalances({
      year,
      search,
      page,
      pageSize: size,
      sortKey: sort.key ?? "employee",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    }),
    listLeaveBalanceYears(),
  ]);

  return (
    <LeaveBalancesTable
      rows={rows}
      totalCount={totalCount}
      year={year === null ? "" : String(year)}
      years={[...new Set([currentYear, ...years])].sort((left, right) => right - left)}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
    />
  );
}
