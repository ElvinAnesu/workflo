import { CandidatesTable } from "@/components/hiring/candidates-table";
import { CANDIDATE_LIST_STATUSES } from "@/components/hiring/hiring.types";
import type { DataTableSort } from "@/components/table/data-table.types";
import { listHiringCandidates, listHiringFormOptions } from "@/server/hiring";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HiringCandidatesPage({ searchParams }: PageProps<"/hiring/candidates">) {
  const params = await searchParams;
  const statusParam = firstParam(params.status) ?? "";
  const status = (CANDIDATE_LIST_STATUSES as readonly string[]).includes(statusParam) ? statusParam : "";
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "";
  const dir = firstParam(params.dir);
  const sort: DataTableSort = sortKey
    ? { key: sortKey, direction: dir === "desc" ? "desc" : "asc" }
    : { key: null, direction: null };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const [{ rows, totalCount }, options] = await Promise.all([
    listHiringCandidates({
      status,
      search,
      page,
      pageSize: size,
      sortKey,
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    }),
    listHiringFormOptions(),
  ]);

  return (
    <CandidatesTable
      rows={rows}
      totalCount={totalCount}
      status={status}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      options={options}
    />
  );
}
