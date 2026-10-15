"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteShiftAction, exportShiftsAction } from "@/app/(app)/shifts/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { ShiftFormDialog } from "@/components/shifts/shift-form-dialog";
import type { ShiftListRow, ShiftLookupOption } from "@/components/shifts/shift.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type ShiftsTableProps = {
  rows: ShiftListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  branches: ShiftLookupOption[];
  departments: ShiftLookupOption[];
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

export function ShiftsTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  branches,
  departments,
}: ShiftsTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<ShiftsTableProps>) {
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
    async (row: ShiftListRow) => {
      const ok = await confirm({
        title: "Delete shift",
        message: `Delete the ${row.shiftName} shift?`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteShiftAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<ShiftListRow>[]>(
    () => [
      { key: "shiftName", label: "Shift name" },
      { key: "branch", label: "Branch", render: (row) => row.branchName, exportValue: (row) => row.branchName },
      {
        key: "department",
        label: "Department",
        render: (row) => row.departmentName,
        exportValue: (row) => row.departmentName,
      },
      { key: "startTime", label: "Start" },
      { key: "endTime", label: "End" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <ShiftFormDialog
                  key={`edit-${row.id}`}
                  shift={row}
                  branches={branches}
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
    [branches, departments, overlay, remove],
  );

  async function handleExport() {
    const exported = await exportShiftsAction({
      search,
      sortKey: sort.key ?? "shiftName",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("shifts.csv", columns, exported);
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
      searchPlaceholder="Search shifts…"
      emptyMessage="No shifts yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          onAdd={() =>
            overlay.show(
              <ShiftFormDialog
                key={`new-${Date.now()}`}
                shift={null}
                branches={branches}
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
