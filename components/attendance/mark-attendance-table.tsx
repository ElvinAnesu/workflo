"use client";

import { Check, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  exportMarkAttendanceAction,
  listMarkRosterAction,
  saveMarkAttendanceAction,
} from "@/app/(app)/attendance/actions";
import {
  ATTENDANCE_STATUSES,
  type AttendanceShiftOption,
  type AttendanceStatus,
  type MarkAttendanceRow,
} from "@/components/attendance/attendance.types";
import { useConfirmDialog } from "@/components/dialog/confirm-dialog-provider";
import { formControlClass } from "@/components/form/form-control";
import { RecordSelect } from "@/components/hr/record-select";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable, TableActions } from "@/components/table/table-actions";

type MarkAttendanceTableProps = {
  date: string;
  shiftId: number;
  shifts: AttendanceShiftOption[];
  rows: MarkAttendanceRow[];
  totalCount: number;
  scheduledCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
};

type ShownRow = MarkAttendanceRow & {
  employee: string;
  shownStatus: AttendanceStatus | "";
};

function queryString(values: {
  date: string;
  shiftId: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const params = new URLSearchParams();
  if (values.date) {
    params.set("date", values.date);
  }
  if (values.shiftId) {
    params.set("shift", String(values.shiftId));
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
  if (values.sort.key && values.sort.direction && !(values.sort.key === "employee" && values.sort.direction === "asc")) {
    params.set("sort", values.sort.key);
    params.set("dir", values.sort.direction);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function MarkAttendanceTable({
  date,
  shiftId,
  shifts,
  rows,
  totalCount,
  scheduledCount,
  search,
  page,
  pageSize,
  sort,
}: MarkAttendanceTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { confirm } = useConfirmDialog();
  const [edits, setEdits] = useState<Record<number, AttendanceStatus | "">>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = Object.keys(edits).length > 0;

  function replaceQuery(next: Partial<MarkAttendanceTableProps>) {
    router.push(
      `${pathname}${queryString({
        date: next.date ?? date,
        shiftId: next.shiftId ?? shiftId,
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  async function changeContext(next: () => void) {
    if (dirty) {
      const ok = await confirm({
        title: "Discard changes",
        message: "Discard unsaved attendance changes?",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) {
        return;
      }
    }
    setEdits({});
    setMessage("");
    next();
  }

  function shownStatus(row: MarkAttendanceRow): AttendanceStatus | "" {
    return edits[row.employeeId] !== undefined ? edits[row.employeeId] : row.status;
  }

  function setStatus(employeeId: number, status: AttendanceStatus | "") {
    setEdits((current) => ({ ...current, [employeeId]: status }));
    setMessage("");
  }

  const shownRows: ShownRow[] = rows.map((row) => ({
    ...row,
    employee: `${row.employeeName} (${row.employeeCode})`,
    shownStatus: shownStatus(row),
  }));

  async function markAllPresent() {
    const roster = await listMarkRosterAction({ workDate: date, shiftId });
    if ("error" in roster) {
      window.alert(roster.error);
      return;
    }
    setEdits((current) => {
      const next = { ...current };
      for (const row of roster.rows) {
        const status = current[row.employeeId] !== undefined ? current[row.employeeId] : row.status;
        if (!status) {
          next[row.employeeId] = "Present";
        }
      }
      return next;
    });
    setMessage("");
  }

  async function handleSave() {
    setPending(true);
    const roster = await listMarkRosterAction({ workDate: date, shiftId });
    if ("error" in roster) {
      setPending(false);
      window.alert(roster.error);
      return;
    }
    const result = await saveMarkAttendanceAction({
      workDate: date,
      shiftId,
      rows: roster.rows.map((row) => ({
        employeeId: row.employeeId,
        status: edits[row.employeeId] !== undefined ? edits[row.employeeId] : row.status,
      })),
    });
    setPending(false);
    if ("error" in result) {
      window.alert(result.error);
      return;
    }
    setEdits({});
    setMessage(
      `Saved attendance for ${result.saved} ${result.saved === 1 ? "employee" : "employees"}.`,
    );
    router.refresh();
  }

  const columns: DataTableColumn<ShownRow>[] = [
    { key: "employee", label: "Employee" },
    ...ATTENDANCE_STATUSES.map((status) => ({
      key: status,
      label: status,
      sortable: false,
      exportValue: false as const,
      render: (row: ShownRow) => (
        <input
          type="checkbox"
          checked={row.shownStatus === status}
          onChange={() => setStatus(row.employeeId, row.shownStatus === status ? "" : status)}
          aria-label={`${row.employee}: ${status}`}
        />
      ),
    })),
  ];

  async function handleExport() {
    const exported = await exportMarkAttendanceAction({
      workDate: date,
      shiftId,
      search,
      sortDirection: sort.direction === "desc" ? "desc" : "asc",
    });
    exportTable(
      `attendance-${date}.csv`,
      [
        { key: "employee", label: "Employee" },
        { key: "status", label: "Status" },
      ],
      exported.map((row) => ({
        employee: `${row.employeeName} (${row.employeeCode})`,
        status: edits[row.employeeId] !== undefined ? edits[row.employeeId] : row.status,
      })),
    );
  }

  const emptyMessage = !date || !shiftId
    ? "Choose a date and shift"
    : scheduledCount === 0
      ? "No people on this shift"
      : "No employees match this search.";

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>
      ) : null}
      {date && shiftId && scheduledCount === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Nobody is scheduled on this shift for {date}.{" "}
          <Link href="/timetable" className="font-medium underline">
            Check the timetable
          </Link>
        </p>
      ) : null}
      <DataTable
        columns={columns}
        rows={shownRows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        search={search}
        sort={sort}
        onSearch={(value) => replaceQuery({ search: value, page: 1 })}
        onSort={(key) => {
          if (key !== "employee") {
            return;
          }
          const nextSort: DataTableSort =
            sort.direction === "asc" ? { key, direction: "desc" } : { key, direction: "asc" };
          replaceQuery({ sort: nextSort, page: 1 });
        }}
        onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
        onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
        searchPlaceholder="Search employees…"
        emptyMessage={emptyMessage}
        actions={
          <TableActions
            onExport={() => {
              void handleExport();
            }}
            exportDisabled={totalCount === 0}
          >
            <input
              type="date"
              aria-label="Date"
              value={date}
              onChange={(event) => {
                const value = event.target.value;
                void changeContext(() => replaceQuery({ date: value, page: 1 }));
              }}
              className={formControlClass}
            />
            <RecordSelect
              ariaLabel="Shift"
              options={shifts.map((shift) => ({ id: String(shift.id), label: shift.markLabel }))}
              value={shiftId ? String(shiftId) : ""}
              onChange={(value) => {
                void changeContext(() => replaceQuery({ shiftId: Number(value) || 0, page: 1 }));
              }}
              placeholder="Select shift"
            />
            <button
              type="button"
              onClick={() => {
                void markAllPresent();
              }}
              disabled={scheduledCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 disabled:opacity-40"
            >
              <Check className="size-4" />
              Mark rest present
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={!dirty || pending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#172554] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="size-4" />
              Save
            </button>
          </TableActions>
        }
      />
    </div>
  );
}
