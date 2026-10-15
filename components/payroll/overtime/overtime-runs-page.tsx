"use client";

import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createOvertimeRunAction } from "@/app/(app)/payroll/actions";
import { linkButtonClass, primaryButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { addMonths } from "@/components/payroll/deduction-plans";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatMoney } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { PayrollRunStatus } from "@/components/payroll/payroll.types";
import { currentPeriod } from "@/components/payroll/run-parts";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

export type OvertimeListRow = {
  id: number;
  period: string;
  payPeriod: string;
  status: PayrollRunStatus;
  createdOn: string;
  employees: number;
  hours: number;
  amount: number;
};

export function OvertimeRunsPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  problems,
}: {
  rows: OvertimeListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  problems: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [period, setPeriod] = useState(() => addMonths(currentPeriod(), -1));
  const [payPeriod, setPayPeriod] = useState(currentPeriod);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

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

  const columns = useMemo<DataTableColumn<OvertimeListRow>[]>(
    () => [
      {
        key: "period",
        label: "Month worked",
        render: (row) => (
          <Link href={`/payroll/overtime/${row.id}`} className={linkButtonClass}>
            {formatPeriod(row.period)}
          </Link>
        ),
      },
      { key: "payPeriod", label: "Paid in payroll", render: (row) => formatPeriod(row.payPeriod) },
      { key: "status", label: "Status", render: (row) => <RunStatusBadge status={row.status} /> },
      { key: "employees", label: "Employees" },
      { key: "hours", label: "Hours" },
      { key: "amount", label: "Overtime pay", render: (row) => formatMoney(row.amount) },
      { key: "createdOn", label: "Created" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <Link href={`/payroll/overtime/${row.id}`} className={linkButtonClass}>
              Open
            </Link>
          </RowActions>
        ),
      },
    ],
    [],
  );

  async function handleCreate() {
    setSubmitted(true);
    setError("");
    if (!period || !payPeriod) {
      setError("Choose both months.");
      return;
    }
    const result = await createOvertimeRunAction(period, payPeriod);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("id" in result) {
      router.push(`/payroll/overtime/${result.id}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-zinc-800">Overtime month payroll processing</h1>
        <p className="text-xs text-zinc-500">
          Record the overtime worked in a month, approve it, then lock it. Locked overtime is paid as an earning
          in the monthly payroll you choose, where it is taxed with the rest of the month&apos;s pay.
        </p>
      </div>

      {problems.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            {problems.join(" ")}{" "}
            <Link href="/settings/overtime" className="font-medium underline">
              Configure overtime rates
            </Link>
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 p-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Month worked
          <input
            type="month"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              if (event.target.value && payPeriod < event.target.value) {
                setPayPeriod(event.target.value);
              }
            }}
            className={submitted && !period ? invalidClass : formControlClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Pay in the payroll of
          <input
            type="month"
            value={payPeriod}
            min={period}
            onChange={(event) => setPayPeriod(event.target.value)}
            className={submitted && !payPeriod ? invalidClass : formControlClass}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void handleCreate();
          }}
          disabled={problems.length > 0}
          className={primaryButtonClass}
        >
          <Plus className="size-4" />
          New overtime sheet
        </button>
        {error ? <p className="self-center text-xs text-red-600">{error}</p> : null}
      </div>

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
        searchPlaceholder="Search overtime sheets…"
        emptyMessage="No overtime sheets yet"
      />
    </div>
  );
}
