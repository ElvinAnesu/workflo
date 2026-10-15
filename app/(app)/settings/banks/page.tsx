import { BanksPage } from "@/components/payroll/settings/banks-page";
import { readListParams } from "@/components/payroll/list-query";
import { listBanks } from "@/server/payroll";

export default async function BanksRoute({ searchParams }: PageProps<"/settings/banks">) {
  const params = await searchParams;
  const list = readListParams(params);
  const { rows, totalCount } = await listBanks({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status: "",
  });

  return (
    <BanksPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
    />
  );
}
