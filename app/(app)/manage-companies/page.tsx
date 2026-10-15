import { CompaniesTable } from "@/components/company/companies-table";
import { listCompanies } from "@/server/companies";
import type { DataTableSort } from "@/components/table/data-table.types";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ManageCompaniesPage({
  searchParams,
}: PageProps<"/manage-companies">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "name";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "name",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const { rows, totalCount } = await listCompanies({
    search,
    page,
    pageSize: size,
    sortKey: sort.key ?? "name",
    sortDirection: sort.direction === "desc" ? "desc" : "asc",
  });

  return (
    <CompaniesTable
      rows={rows}
      totalCount={totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
    />
  );
}
