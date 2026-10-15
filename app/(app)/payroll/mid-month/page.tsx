import { MidMonthRunsPage } from "@/components/payroll/mid-month/mid-month-runs-page";
import { readListParams } from "@/components/payroll/list-query";
import { listMidMonthRuns } from "@/server/payroll-operations";

export default async function MidMonthPayrollRoute({ searchParams }: PageProps<"/payroll/mid-month">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount, readiness } = await listMidMonthRuns({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <MidMonthRunsPage
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
