import { ComponentAssignmentPage } from "@/components/payroll/component-assignment-page";
import { firstParam, readListParams } from "@/components/payroll/list-query";
import { listPayAssignments } from "@/server/payroll-operations";

export default async function ComponentAssignmentRoute({
  searchParams,
}: PageProps<"/payroll/component-assignment">) {
  const params = await searchParams;
  const list = readListParams(params);
  const rawStatus = firstParam(params.status);
  const status = rawStatus == null || rawStatus === "" ? "Active" : rawStatus === "All" ? "" : rawStatus;
  const { rows, totalCount } = await listPayAssignments({
    search: list.search,
    page: list.page,
    pageSize: list.pageSize,
    sortKey: list.sortKey,
    sortDirection: list.sortDirection,
    status,
  });

  return (
    <ComponentAssignmentPage
      rows={rows}
      totalCount={totalCount}
      search={list.search}
      page={list.page}
      pageSize={list.pageSize}
      sort={list.sort}
      status={rawStatus === "All" ? "All" : "Active"}
    />
  );
}
