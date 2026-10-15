import { EmployeesTable } from "@/components/employees/employees-table";
import {
  listEmployeeFormOptions,
  listEmployees,
  peekNextEmployeeCode,
} from "@/server/employees";
import type { DataTableSort } from "@/components/table/data-table.types";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployeesPage({
  searchParams,
}: PageProps<"/employees">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "employeeCode";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "employeeCode",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;
  const listQuery = {
    search,
    page,
    pageSize: size,
    sortKey: sort.key ?? "employeeCode",
    sortDirection: sort.direction === "desc" ? "desc" as const : "asc" as const,
  };

  const [{ rows, totalCount }, options, nextCode] = await Promise.all([
    listEmployees(listQuery),
    listEmployeeFormOptions(),
    peekNextEmployeeCode(),
  ]);

  return (
    <EmployeesTable
      rows={rows}
      totalCount={totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      nextCode={nextCode}
      branches={options.branches}
      departments={options.departments}
      employmentTypes={options.employmentTypes}
      employeeCategories={options.employeeCategories}
    />
  );
}
