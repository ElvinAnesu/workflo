import { OvertimeRunsPage } from "@/components/payroll/overtime/overtime-runs-page";
import { readListParams } from "@/components/payroll/list-query";
import { listOvertimeRuns } from "@/server/payroll-operations";

export default async function OvertimePayrollRoute({ searchParams }: PageProps<"/payroll/overtime">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount, problems } = await listOvertimeRuns({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <OvertimeRunsPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      problems={problems}
    />
  );
}
