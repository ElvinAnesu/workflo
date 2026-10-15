import { DeductionPlansPage } from "@/components/payroll/plans/deduction-plans-page";
import { readListParams } from "@/components/payroll/list-query";
import { listDeductionPlans } from "@/server/payroll-operations";
import type { DeductionPlanKind } from "@/components/payroll/payroll.types";

export async function DeductionPlansRoute({
  kind,
  searchParams,
}: {
  kind: DeductionPlanKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const list = readListParams(params);
  const result = await listDeductionPlans(kind, {
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: list.status,
  });

  return (
    <DeductionPlansPage
      kind={kind}
      rows={result.rows}
      totalCount={result.totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      status={list.status}
      awaiting={result.awaiting}
      paused={result.paused}
      running={result.running}
      completed={result.completed}
      outstanding={result.outstanding}
      dueNext={result.dueNext}
      nextPeriod={result.nextPeriod}
    />
  );
}
