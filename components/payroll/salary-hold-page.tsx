"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deleteHoldAction,
  holdEmployeesAction,
  releaseHoldAction,
  saveHoldAction,
} from "@/app/(app)/payroll/actions";
import { useOverlayDialog } from "@/components/dialog/overlay-dialog-provider";
import {
  dangerLinkButtonClass,
  FormDialogFrame,
  FormField,
  linkButtonClass,
  primaryButtonClass,
  sectionGridClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { HoldListRow } from "@/components/payroll/payroll.types";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

type HoldEmployee = { id: number; employee_code: string; name: string };

function HoldDialog({ hold, onClose }: { hold: HoldListRow | null; onClose: () => void }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<HoldEmployee[]>([]);
  const [form, setForm] = useState({
    employeeId: hold?.employeeId ?? "",
    fromPeriod: hold?.fromPeriod ?? currentPeriod(),
    toPeriod: hold?.toPeriod ?? "",
    reason: hold?.reason ?? "",
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void holdEmployeesAction(hold ? Number(hold.employeeId) : undefined).then(setEmployees);
  }, [hold]);

  async function handleSubmit() {
    setSubmitted(true);
    if (!form.employeeId || !form.fromPeriod || !form.reason.trim()) {
      setError("Employee, start month and reason are required.");
      return;
    }
    if (form.toPeriod && form.toPeriod < form.fromPeriod) {
      setError("The end month cannot be before the start month.");
      return;
    }
    const result = await saveHoldAction({
      id: hold ? Number(hold.id) : undefined,
      employeeId: Number(form.employeeId),
      fromPeriod: form.fromPeriod,
      toPeriod: form.toPeriod,
      reason: form.reason.trim(),
    });
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <FormDialogFrame
      title={hold ? "Update salary hold" : "Hold salary"}
      submitLabel={hold ? "Save" : "Hold salary"}
      onSubmit={() => {
        void handleSubmit();
      }}
      onClose={onClose}
      error={error}
    >
      <div className={sectionGridClass}>
        <FormField label="Employee" className="sm:col-span-2">
          <select
            value={form.employeeId}
            disabled={Boolean(hold)}
            onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
            className={submitted && !form.employeeId ? invalidClass : formControlClass}
          >
            <option value="">Select</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_code} · {employee.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="From month">
          <input
            type="month"
            value={form.fromPeriod}
            onChange={(event) => setForm({ ...form, fromPeriod: event.target.value })}
            className={submitted && !form.fromPeriod ? invalidClass : formControlClass}
          />
        </FormField>
        <FormField label="To month" hint="Leave empty to hold until released">
          <input
            type="month"
            value={form.toPeriod}
            onChange={(event) => setForm({ ...form, toPeriod: event.target.value })}
            className={formControlClass}
          />
        </FormField>
        <FormField label="Reason" className="sm:col-span-4">
          <input
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            className={submitted && !form.reason.trim() ? invalidClass : formControlClass}
          />
        </FormField>
        <p className="text-xs text-zinc-500 sm:col-span-4">
          Pay is still calculated, so statutory contributions and PAYE are declared as normal, but the net pay is
          not included in the bank payment total until the hold ends or is released.
        </p>
      </div>
    </FormDialogFrame>
  );
}

export function SalaryHoldPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
}: {
  rows: HoldListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
}) {
  const overlay = useOverlayDialog();
  const router = useRouter();
  const pathname = usePathname();

  function replaceQuery(next: { search?: string; page?: number; pageSize?: number; sort?: DataTableSort }) {
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
      })}`,
    );
  }

  const columns = useMemo<DataTableColumn<HoldListRow>[]>(
    () => [
      { key: "employeeCode", label: "Employee code" },
      { key: "employeeName", label: "Employee name" },
      { key: "fromPeriod", label: "From", render: (row) => formatPeriod(row.fromPeriod) },
      {
        key: "toPeriod",
        label: "To",
        render: (row) => (row.toPeriod ? formatPeriod(row.toPeriod) : "Until released"),
      },
      { key: "reason", label: "Reason" },
      { key: "holdStatus", label: "Status" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) =>
          row.releasedOn ? (
            <span className="text-xs text-zinc-500">Released {row.releasedOn}</span>
          ) : (
            <RowActions>
              <button
                type="button"
                onClick={() => overlay.show(<HoldDialog key={`edit-${row.id}`} hold={row} onClose={overlay.close} />)}
                className={linkButtonClass}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Release the salary hold for ${row.employeeName}?`)) {
                    void releaseHoldAction(Number(row.id)).then((result) => {
                      if ("error" in result && result.error) {
                        window.alert(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }
                }}
                className="text-xs font-medium text-emerald-700"
              >
                Release
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete the salary hold for ${row.employeeName}?`)) {
                    void deleteHoldAction(Number(row.id)).then((result) => {
                      if ("error" in result && result.error) {
                        window.alert(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }
                }}
                className={dangerLinkButtonClass}
              >
                Delete
              </button>
            </RowActions>
          ),
      },
    ],
    [overlay, router],
  );

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
      onSort={(key) => replaceQuery({ sort: nextSort(sort, key), page: 1 })}
      onPageChange={(nextPage) => replaceQuery({ page: nextPage })}
      onPageSizeChange={(nextSize) => replaceQuery({ pageSize: nextSize, page: 1 })}
      searchPlaceholder="Search salary holds…"
      emptyMessage="No salary holds"
      actions={
        <button
          type="button"
          onClick={() => overlay.show(<HoldDialog key={`new-${Date.now()}`} hold={null} onClose={overlay.close} />)}
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          Hold salary
        </button>
      }
    />
  );
}
