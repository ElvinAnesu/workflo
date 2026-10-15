"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteLeaveTypeAction, exportLeaveTypesAction } from "@/app/(app)/leave-types/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { LeaveTypeFormDialog } from "@/components/leave-types/leave-type-form-dialog";
import type { LeaveDepartmentOption, LeaveTypeListRow } from "@/components/leave-types/leave-type.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type LeaveTypesTableProps = {
  rows: LeaveTypeListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  departments: LeaveDepartmentOption[];
};

function queryString(values: { search: string; page: number; pageSize: number; sort: DataTableSort }) {
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
  if (
    values.sort.key &&
    values.sort.direction &&
    !(values.sort.key === "leaveTypeName" && values.sort.direction === "asc")
  ) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function LeaveTypesTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  departments,
}: LeaveTypesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<LeaveTypesTableProps>) {
    router.push(
      `${pathname}${queryString({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const remove = useCallback(
    async (row: LeaveTypeListRow) => {
      const ok = await confirm({
        title: "Delete leave type",
        message: `Delete the ${row.name} leave type?`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteLeaveTypeAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<LeaveTypeListRow>[]>(
    () => [
      { key: "leaveTypeName", label: "Leave type name", render: (row) => row.name, exportValue: (row) => row.name },
      { key: "daysPerYear", label: "Days per year" },
      { key: "paidUnpaid", label: "Paid / unpaid" },
      { key: "appliesTo", label: "Applies to" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <LeaveTypeFormDialog
                  key={`edit-${row.id}`}
                  leaveType={row}
                  departments={departments}
                  onClose={overlay.close}
                />,
              )
            }
            onDelete={() => {
              void remove(row);
            }}
          />
        ),
      },
    ],
    [departments, overlay, remove],
  );

  async function handleExport() {
    const exported = await exportLeaveTypesAction({
      search,
      sortKey: sort.key ?? "leaveTypeName",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("leave-types.csv", columns, exported);
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
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search leave types…"
      emptyMessage="No leave types yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          onAdd={() =>
            overlay.show(
              <LeaveTypeFormDialog
                key={`new-${Date.now()}`}
                leaveType={null}
                departments={departments}
                onClose={overlay.close}
              />,
            )
          }
        />
      }
    />
  );
}
