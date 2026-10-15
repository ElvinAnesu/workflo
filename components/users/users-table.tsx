"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  exportUsersAction,
  setUserActiveAction,
} from "@/app/(app)/users/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import type { RoleSelectOption, UserListRow } from "@/components/users/user.types";

type UsersTableProps = {
  rows: UserListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  currentUserId: number;
  roles: RoleSelectOption[];
};

function queryString(values: {
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function UsersTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  currentUserId,
  roles,
}: UsersTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<UsersTableProps>) {
    router.push(
      `${pathname}${queryString({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const toggleActive = useCallback(
    async (row: UserListRow) => {
      const activating = !row.isActive;
      const ok = await confirm({
        title: activating ? "Activate user" : "Deactivate user",
        message: activating
          ? `Activate ${row.username}?`
          : `Deactivate ${row.username}? They will stay in the list so they can be turned back on.`,
        confirmLabel: activating ? "Activate" : "Deactivate",
        variant: activating ? "default" : "danger",
      });
      if (!ok) {
        return;
      }
      const result = await setUserActiveAction(row.id, activating);
      if ("error" in result && result.error) {
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<UserListRow>[]>(
    () => [
      { key: "username", label: "Username" },
      { key: "email", label: "Email" },
      { key: "fullName", label: "Full name" },
      {
        key: "roleName",
        label: "Role",
        render: (row) => row.roleName || "No role",
        exportValue: (row) => row.roleName || "No role",
      },
      {
        key: "isSuperUser",
        label: "Super user",
        render: (row) => (row.isSuperUser ? "Yes" : "No"),
        exportValue: (row) => (row.isSuperUser ? "Yes" : "No"),
      },
      {
        key: "isActive",
        label: "Status",
        render: (row) => (row.isActive ? "Active" : "Inactive"),
        exportValue: (row) => (row.isActive ? "Active" : "Inactive"),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        exportValue: false,
        render: (row) => (
          <RowActions>
            <button
              type="button"
              onClick={() =>
                overlay.show(
                  <UserFormDialog
                    user={row}
                    roles={roles}
                    onClose={overlay.close}
                  />,
                )
              }
              className="text-xs font-medium text-[#1E40AF]"
            >
              Edit
            </button>
            {row.id === currentUserId ? null : (
              <button
                type="button"
                onClick={() => {
                  void toggleActive(row);
                }}
                className={
                  row.isActive
                    ? "text-xs font-medium text-red-600"
                    : "text-xs font-medium text-[#1E40AF]"
                }
              >
                {row.isActive ? "Deactivate" : "Activate"}
              </button>
            )}
          </RowActions>
        ),
      },
    ],
    [currentUserId, overlay, roles, toggleActive],
  );

  async function handleExport() {
    const exported = await exportUsersAction({
      search,
      sortKey: sort.key ?? "username",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("users", columns, exported);
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      search={search}
      sort={sort}
      onSearch={(value) => replaceQuery({ search: value, page: 1 })}
      onSort={(key) => {
        const nextSort: DataTableSort =
          sort.key !== key
            ? { key, direction: "asc" }
            : sort.direction === "asc"
              ? { key, direction: "desc" }
              : { key: null, direction: null };
        replaceQuery({ sort: nextSort, page: 1 });
      }}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) =>
        replaceQuery({ pageSize: nextSize, page: 1 })
      }
      searchPlaceholder="Search users…"
      emptyMessage="No users"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <UserFormDialog
                user={null}
                roles={roles}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
