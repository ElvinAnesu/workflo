"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { deleteTimetableAction, exportTimetableAction } from "@/app/(app)/timetable/actions";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, RowActions, TableActions } from "@/components/table/table-actions";
import { TimetableFormDialog } from "@/components/timetable/timetable-form-dialog";
import type {
  TimetableDepartmentOption,
  TimetableListRow,
  TimetableShiftOption,
} from "@/components/timetable/timetable.types";

type TimetableTableProps = {
  rows: TimetableListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  shifts: TimetableShiftOption[];
  departments: TimetableDepartmentOption[];
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

function patternLabel(row: TimetableListRow) {
  return row.pattern === "weekly" ? "Weekly" : "Date override";
}

function dayOrDate(row: TimetableListRow) {
  return row.pattern === "weekly" ? row.weekdays.join(", ") : row.workDate;
}

function employeeNames(row: TimetableListRow) {
  return row.employees.map((employee) => employee.name).join(", ");
}

export function TimetableTable({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  shifts,
  departments,
}: TimetableTableProps) {
  const overlay = useOverlayDialog();
  const { confirm } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: Partial<TimetableTableProps>) {
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
    async (row: TimetableListRow) => {
      const ok = await confirm({
        title: "Delete timetable entry",
        message: "Delete this timetable entry?",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
      const result = await deleteTimetableAction(row.id);
      if ("error" in result && result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    },
    [confirm, router],
  );

  const columns = useMemo<DataTableColumn<TimetableListRow>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        exportValue: (row) => row.name,
      },
      {
        key: "pattern",
        label: "Pattern",
        render: (row) => patternLabel(row),
        exportValue: (row) => patternLabel(row),
      },
      {
        key: "dayOrDate",
        label: "Day / date",
        render: (row) => dayOrDate(row),
        exportValue: (row) => dayOrDate(row),
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
      {
        key: "employeeCount",
        label: "Employees",
        render: (row) => <span title={employeeNames(row)}>{row.employees.length}</span>,
        exportValue: (row) => employeeNames(row),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions
            onEdit={() =>
              overlay.show(
                <TimetableFormDialog
                  key={`edit-${row.id}`}
                  entry={row}
                  shifts={shifts}
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
    [departments, overlay, remove, shifts],
  );

  async function handleExport() {
    const exported = await exportTimetableAction({
      search,
      sortKey: sort.key ?? "pattern",
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable("timetable.csv", columns, exported);
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
      searchPlaceholder="Search timetable…"
      emptyMessage="No timetable entries yet"
      actions={
        <TableActions
          onExport={() => {
            void handleExport();
          }}
          exportDisabled={totalCount === 0}
          onAdd={() =>
            overlay.show(
              <TimetableFormDialog
                key={`new-${Date.now()}`}
                entry={null}
                shifts={shifts}
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
