import { UsersTable } from "@/components/users/users-table";
import { listRolesForSelect } from "@/server/roles";
import { listUsers } from "@/server/users";
import { getSession } from "@/server/session";
import type { DataTableSort } from "@/components/table/data-table.types";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UsersPage({
  searchParams,
}: PageProps<"/users">) {
  const params = await searchParams;
  const search = firstParam(params.search) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? 1) || 1);
  const pageSize = Number(firstParam(params.pageSize) ?? 10) || 10;
  const sortKey = firstParam(params.sort) ?? "username";
  const dir = firstParam(params.dir);
  const sortDirection = dir === "desc" ? "desc" : "asc";
  const sort: DataTableSort = {
    key: firstParam(params.sort) ? sortKey : "username",
    direction: firstParam(params.sort) ? sortDirection : "asc",
  };
  const size = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10;

  const session = await getSession();
  const roles = await listRolesForSelect();
  const { rows, totalCount } = await listUsers({
    search,
    page,
    pageSize: size,
    sortKey: sort.key ?? "username",
    sortDirection: sort.direction === "desc" ? "desc" : "asc",
  });

  return (
    <UsersTable
      rows={rows}
      totalCount={totalCount}
      search={search}
      page={page}
      pageSize={size}
      sort={sort}
      currentUserId={session?.user.id ?? 0}
      roles={roles}
    />
  );
}
