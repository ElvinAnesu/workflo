import { PayrollRunsPage } from "@/components/payroll/payroll-runs-page";
import { readListParams } from "@/components/payroll/list-query";
import { listMonthlyRuns } from "@/server/payroll-operations";

export default async function MonthlyPayrollRoute({ searchParams }: PageProps<"/payroll/monthly">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount, readiness } = await listMonthlyRuns({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <PayrollRunsPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      readiness={readiness}
    />
  );
}
