"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteRoleAction,
  exportRolesAction,
} from "@/app/(app)/roles/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { RoleFormDialog } from "@/components/roles/role-form-dialog";
import type { RoleListRow, RoleRow } from "@/components/roles/role.types";
import { DataTable } from "@/components/table/data-table";
import type {
  DataTableColumn,
  DataTableSort,
} from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type RolesTableProps = {
  rows: RoleListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
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

function toFormRole(row: RoleListRow): RoleRow {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    isSuperAdmin: false,
    permissions: row.permissions,
  };
}

export function RolesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: RolesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<RolesTableProps>) {
    router.push(
      `${pathname}${queryString({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const removeRole = useCallback(
    async (row: RoleListRow) => {
      if (row.userCount > 0) {
        window.alert(
          `${row.name} cannot be deleted because ${row.userCount} user${
            row.userCount === 1 ? " has" : "s have"
          } this role.`,
        );
        return;
      }
      const ok = await confirm({
        title: "Delete role",
        message: `Delete the ${row.name} role?`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteRoleAction(row.id);
      if ("error" in result && result.error) {
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<RoleListRow>[]>(
    () => [
      { key: "name", label: "Role name" },
      { key: "description", label: "Description" },
      {
        key: "featureCount",
        label: "Features",
        sortable: false,
        render: (row) => row.featureCount,
        exportValue: (row) => row.featureCount,
      },
      { key: "userCount", label: "Users" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        exportValue: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <RoleFormDialog
                  key={`edit-${row.id}`}
                  role={toFormRole(row)}
                  onClose={overlay.close}
                />,
              )
            }
            onDelete={() => {
              void removeRole(row);
            }}
          />
        ),
      },
    ],
    [overlay, removeRole],
  );

  async function handleExport() {
    const exported = await exportRolesAction({
      search,
      sortKey: sort.key ?? "name",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("roles", columns, exported);
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
      searchPlaceholder="Search roles…"
      emptyMessage="No roles yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          onAdd={() =>
            overlay.show(
              <RoleFormDialog
                key={`new-${Date.now()}`}
                role={null}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
