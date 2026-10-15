import { SalaryHoldPage } from "@/components/payroll/salary-hold-page";
import { readListParams } from "@/components/payroll/list-query";
import { listSalaryHolds } from "@/server/payroll-operations";

export default async function SalaryHoldRoute({ searchParams }: PageProps<"/payroll/salary-hold">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount } = await listSalaryHolds({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <SalaryHoldPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
    />
  );
}
