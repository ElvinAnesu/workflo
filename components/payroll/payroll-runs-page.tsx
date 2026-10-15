"use client";

import { AlertTriangle, Play } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createMonthlyAction } from "@/app/(app)/payroll/actions";
import { linkButtonClass, primaryButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatMoney } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { RunListRow } from "@/components/payroll/payroll.types";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";
import { DataTable } from "@/components/table/data-table";
import { RowActions } from "@/components/table/table-actions";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

export function PayrollRunsPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  readiness,
}: {
  rows: RunListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  readiness: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
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

  const columns = useMemo<DataTableColumn<RunListRow>[]>(
    () => [
      {
        key: "period",
        label: "Month",
        render: (row) => (
          <Link href={`/payroll/monthly/${row.id}`} className={linkButtonClass}>
            {formatPeriod(row.period)}
          </Link>
        ),
      },
      { key: "status", label: "Status", render: (row) => <RunStatusBadge status={row.status} /> },
      { key: "employees", label: "Employees" },
      { key: "grossPay", label: "Gross pay", render: (row) => formatMoney(row.grossPay) },
      { key: "paye", label: "PAYE", render: (row) => formatMoney(row.paye) },
      { key: "netPayable", label: "Net payable", render: (row) => formatMoney(row.netPayable) },
      { key: "employerCost", label: "Employer cost", render: (row) => formatMoney(row.employerCost) },
      { key: "createdOn", label: "Created" },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        render: (row) => (
          <RowActions>
            <Link href={`/payroll/monthly/${row.id}`} className={linkButtonClass}>
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
    if (!period) {
      setError("Choose a month.");
      return;
    }
    const result = await createMonthlyAction(period);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("id" in result) {
      router.push(`/payroll/monthly/${result.id}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold text-zinc-800">Monthly payroll processing</h1>
        <p className="text-xs text-zinc-500">Run payroll for a month, review it, approve it, then lock it to release payslips.</p>
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
          Payroll month
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className={submitted && !period ? invalidClass : formControlClass}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void handleRun();
          }}
          disabled={Boolean(readiness)}
          className={primaryButtonClass}
        >
          <Play className="size-4" />
          Run payroll
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
        searchPlaceholder="Search payrolls…"
        emptyMessage="No payrolls have been run yet"
      />
    </div>
  );
}
