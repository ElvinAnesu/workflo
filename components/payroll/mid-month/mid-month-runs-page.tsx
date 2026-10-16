"use client";

import { AlertTriangle, Play } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createMidMonthAction } from "@/app/(app)/payroll/actions";
import { linkButtonClass, primaryButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { basisLabel } from "@/components/payroll/mid-month";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import { MID_MONTH_BASES, type MidMonthBasis, type PayrollRunStatus } from "@/components/payroll/payroll.types";
import { currentPeriod } from "@/components/payroll/run-parts";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";
import { DataTable } from "@/components/table/data-table";
import { RowActions, usePageCan } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

export type MidMonthListRow = {
  id: number;
  period: string;
  status: PayrollRunStatus;
  basis: MidMonthBasis;
  value: number;
  paymentDate: string;
  createdOn: string;
  employees: number;
  amount: number;
};

export function MidMonthRunsPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  readiness,
}: {
  rows: MidMonthListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  readiness: string;
}) {
  const router = useRouter();
  const canRun = usePageCan("run");
  const pathname = usePathname();
  const [period, setPeriod] = useState(currentPeriod);
  const [basis, setBasis] = useState<MidMonthBasis>("% of basic salary");
  const [value, setValue] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => `${currentPeriod()}-15`);
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

  const columns = useMemo<DataTableColumn<MidMonthListRow>[]>(
    () => [
      {
        key: "period",
        label: "Month",
        render: (row) => (
          <Link href={`/payroll/mid-month/${row.id}`} className={linkButtonClass}>
            {formatPeriod(row.period)}
          </Link>
        ),
      },
      { key: "status", label: "Status", render: (row) => <RunStatusBadge status={row.status} /> },
      { key: "basis", label: "Basis", render: (row) => basisLabel(row.basis, row.value) },
      { key: "paymentDate", label: "Payment date" },
      { key: "employees", label: "Employees paid" },
      { key: "amount", label: "Total", render: (row) => formatMoney(row.amount) },
      { key: "createdOn", label: "Created" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <Link href={`/payroll/mid-month/${row.id}`} className={linkButtonClass}>
              Open
            </Link>
          </RowActions>
        ),
      },
    ],
    [],
  );

  async function handleRun() {
    setSubmitted(true);
    setError("");
    const amount = parseAmount(value || "0");
    if (!period || !paymentDate) {
      setError("Choose the month and payment date.");
      return;
    }
    if (!paymentDate.startsWith(`${period}-`)) {
      setError(`The payment date must be in ${formatPeriod(period)}.`);
      return;
    }
    const result = await createMidMonthAction(period, basis, amount, paymentDate);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("id" in result) {
      router.push(`/payroll/mid-month/${result.id}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-zinc-800">Mid month payroll processing</h1>
        <p className="text-xs text-zinc-500">
          Pay part of the month&apos;s salary in the middle of the month. Once locked, each payment is deducted
          from the same month&apos;s monthly payroll. Tax and contributions are worked out there, on the full
          month&apos;s pay.
        </p>
      </div>

      {readiness ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-px size-4 shrink-0" />
          <span>
            {readiness}{" "}
            <Link href="/settings/tax-bands" className="font-medium underline">
              Configure tax bands
            </Link>
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 p-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Month
          <input
            type="month"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              if (event.target.value) {
                setPaymentDate(`${event.target.value}-15`);
              }
            }}
            className={submitted && !period ? invalidClass : formControlClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Pay
          <select value={basis} onChange={(event) => setBasis(event.target.value as MidMonthBasis)} className={formControlClass}>
            {MID_MONTH_BASES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          {basis === "% of basic salary" ? "Percentage" : "Amount per employee"}
          <input
            inputMode="decimal"
            value={value}
            placeholder={basis === "% of basic salary" ? "e.g. 40" : ""}
            onChange={(event) => setValue(event.target.value)}
            className={`${submitted && !(parseAmount(value || "0") > 0) ? invalidClass : formControlClass} w-32`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Payment date
          <input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            className={submitted && !paymentDate ? invalidClass : formControlClass}
          />
        </label>
        {canRun ? (
        <button
          type="button"
          onClick={() => {
            void handleRun();
          }}
          disabled={Boolean(readiness)}
          className={primaryButtonClass}
        >
          <Play className="size-4" />
          Run mid-month payroll
        </button>
        ) : null}
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
        searchPlaceholder="Search mid-month payrolls…"
        emptyMessage="No mid-month payrolls have been run yet"
      />
    </div>
  );
}
