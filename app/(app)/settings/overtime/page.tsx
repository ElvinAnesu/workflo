import { OvertimeRatesPage } from "@/components/payroll/settings/overtime-rates-page";
import { readListParams } from "@/components/payroll/list-query";
import { listOvertimeSettings } from "@/server/payroll-operations";

export default async function OvertimeRatesRoute({ searchParams }: PageProps<"/settings/overtime">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount, standardMonthlyHours } = await listOvertimeSettings({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <OvertimeRatesPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      standardMonthlyHours={standardMonthlyHours}
    />
  );
}
