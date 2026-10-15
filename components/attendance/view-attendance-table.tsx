"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteAttendanceAction, exportAttendanceAction } from "@/app/(app)/attendance/actions";
import { AttendanceFormDialog } from "@/components/attendance/attendance-form-dialog";
import {
  ATTENDANCE_STATUSES,
  type AttendanceEmployeeOption,
  type AttendanceListRow,
  type AttendanceShiftOption,
} from "@/components/attendance/attendance.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { formControlClass } from "@/components/form/form-control";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";

type ViewAttendanceTableProps = {
  rows: AttendanceListRow[];
  totalCount: number;
  month: string;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  shifts: AttendanceShiftOption[];
  employees: AttendanceEmployeeOption[];
};

function queryString(values: {
  month: string;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  params.set("month", values.month);
  if (values.status) {
    params.set("status", values.status);
  }
  if (values.search) {
    params.set("search", values.search);
  }
  if (values.page !== 1) {
    params.set("page", String(values.page));
  }
  if (values.pageSize !== 10) {
    params.set("pageSize", String(values.pageSize));
  }
  if (values.sort.key && values.sort.direction && !(values.sort.key === "date" && values.sort.direction === "desc")) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  return `?${params.toString()}`;
}

function employeeLabel(row: AttendanceListRow) {
  return `${row.employeeName} (${row.employeeCode})`;
}

export function ViewAttendanceTable({
  rows,
  totalCount,
  month,
  status,
  search,
  page,
  pageSize,
  sort,
  shifts,
  employees,
}: ViewAttendanceTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<ViewAttendanceTableProps>) {
    router.push(
      `${pathname}${queryString({
        month: next.month ?? month,
        status: next.status ?? status,
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const remove = useCallback(
    async (row: AttendanceListRow) => {
      const ok = await confirm({
        title: "Delete attendance",
        message: `Delete the ${row.workDate} attendance for ${employeeLabel(row)}?`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteAttendanceAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<AttendanceListRow>[]>(
    () => [
      { key: "date", label: "Date", render: (row) => row.workDate, exportValue: (row) => row.workDate },
      {
        key: "employee",
        label: "Employee",
        render: (row) => employeeLabel(row),
        exportValue: (row) => employeeLabel(row),
      },
      {
        key: "shift",
        label: "Shift",
        render: (row) => row.shiftName,
        exportValue: (row) => row.shiftName,
      },
      {
        key: "branch",
        label: "Branch",
        render: (row) => row.branchName,
        exportValue: (row) => row.branchName,
      },
      {
        key: "department",
        label: "Department",
        render: (row) => row.departmentName,
        exportValue: (row) => row.departmentName,
      },
      { key: "status", label: "Status" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <AttendanceFormDialog
                  key={`edit-${row.id}`}
                  record={row}
                  shifts={shifts}
                  employees={employees}
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
    [employees, overlay, remove, shifts],
  );

  async function handleExport() {
    const exported = await exportAttendanceAction({
      month: /^\d{4}-\d{2}$/.test(month) ? month : "",
      status,
      search,
      sortKey: sort.key ?? "date",
      sortDirection: sort.direction === "asc" ? "asc" : "desc",
    });
    exportTable(
      `attendance-${/^\d{4}-\d{2}$/.test(month) ? month : "all"}.csv`,
      columns,
      exported,
    );
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
            ? { key, direction: key === "date" ? "desc" : "asc" }
            : sort.direction === "desc"
              ? { key, direction: "asc" }
              : sort.direction === "asc"
                ? { key: null, direction: null }
                : { key, direction: "desc" };
        replaceQuery({ sort: nextSort, page: 1 });
      }}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search attendance…"
      emptyMessage="No attendance recorded for this period"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          onAdd={() =>
            overlay.show(
              <AttendanceFormDialog
                key={`new-${Date.now()}`}
                record={null}
                shifts={shifts}
                employees={employees}
                onClose={overlay.close}
              />,
            )
          }
        >
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(event) => replaceQuery({ month: event.target.value, page: 1 })}
            className={formControlClass}
          />
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => replaceQuery({ status: event.target.value, page: 1 })}
            className={formControlClass}
          >
            <option value="">All statuses</option>
            {ATTENDANCE_STATUSES.map((item) => (
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
