"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteLeaveBalanceAction, exportLeaveBalancesAction } from "@/app/(app)/leave/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { formControlClass } from "@/components/form/form-control";
import { LeaveBalanceFormDialog } from "@/components/leave-balances/leave-balance-form-dialog";
import type { LeaveBalanceListRow } from "@/components/leave-balances/leave-balance.types";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type LeaveBalancesTableProps = {
  rows: LeaveBalanceListRow[];
  totalCount: number;
  year: string;
  years: number[];
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
};

function queryString(values: {
  year: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  params.set("year", values.year);
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction && !(values.sort.key === "employee" && values.sort.direction === "asc")) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  return `?${params.toString()}`;
}

function employeeLabel(row: LeaveBalanceListRow) {
  return `${row.employeeName} (${row.employeeCode})`;
}

export function LeaveBalancesTable({
  rows,
  totalCount,
  year,
  years,
  search,
  page,
  pageSize,
  sort,
}: LeaveBalancesTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<LeaveBalancesTableProps>) {
    router.push(
      `${pathname}${queryString({
        year: next.year ?? year,
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const remove = useCallback(
    async (row: LeaveBalanceListRow) => {
      const ok = await confirm({
        title: "Delete leave balance",
        message: `Delete the ${row.year} ${row.leaveTypeName} balance for ${employeeLabel(row)}?`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      if (row.overrideId === null) {
        return;
      }
      const result = await deleteLeaveBalanceAction(row.employeeId, row.leaveTypeId, row.year);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<LeaveBalanceListRow>[]>(
    () => [
      { key: "employee", label: "Employee", render: (row) => employeeLabel(row), exportValue: (row) => employeeLabel(row) },
      {
        key: "leaveType",
        label: "Leave type",
        render: (row) => row.leaveTypeName,
        exportValue: (row) => row.leaveTypeName,
      },
      { key: "year", label: "Year" },
      { key: "entitled", label: "Entitled" },
      { key: "taken", label: "Taken" },
      {
        key: "remaining",
        label: "Remaining",
        render: (row) => (
          <span className={row.remaining < 0 ? "font-medium text-red-600" : ""}>{row.remaining}</span>
        ),
        exportValue: (row) => row.remaining,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <LeaveBalanceFormDialog key={`edit-${row.employeeId}-${row.leaveTypeId}-${row.year}`} balance={row} onClose={overlay.close} />,
              )
            }
            onDelete={
              row.overrideId === null
                ? undefined
                : () => {
                    void remove(row);
                  }
            }
          />
        ),
      },
    ],
    [overlay, remove],
  );

  async function handleExport() {
    const parsed = Number(year);
    const exported = await exportLeaveBalancesAction({
      year: Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : null,
      search,
      sortKey: sort.key ?? "employee",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable(`leave-balances-${year || "all"}.csv`, columns, exported);
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
      searchPlaceholder="Search leave balances…"
      emptyMessage="No leave balances for this year"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
        >
          <select
            aria-label="Year"
            value={year}
            onChange={(event) => replaceQuery({ year: event.target.value, page: 1 })}
            className={formControlClass}
          >
            <option value="">All years</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </TableActions>
      }
    />
  );
}
