import { StatutoryRatesPage } from "@/components/payroll/settings/statutory-rates-page";
import { readListParams } from "@/components/payroll/list-query";
import { listContributions } from "@/server/payroll";

export default async function StatutoryRatesRoute({
  searchParams,
}: PageProps<"/settings/statutory-rates">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount } = await listContributions({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <StatutoryRatesPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
    />
  );
}
