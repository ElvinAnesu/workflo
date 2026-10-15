import { PayComponentsPage } from "@/components/payroll/settings/pay-components-page";
import { readListParams } from "@/components/payroll/list-query";
import { listPayComponents } from "@/server/payroll";

export default async function PayComponentsRoute({
  searchParams,
}: PageProps<"/settings/pay-components">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount } = await listPayComponents({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <PayComponentsPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
    />
  );
}
