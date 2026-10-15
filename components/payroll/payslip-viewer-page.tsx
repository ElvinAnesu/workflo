"use client";

import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { listPayslipsAction } from "@/app/(app)/payroll/actions";
import { linkButtonClass, primaryButtonClass, secondaryButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { nextSort, payrollQuery } from "@/components/payroll/list-query";
import { formatMoney } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { PayslipListRow } from "@/components/payroll/payroll.types";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";
import { DataTable } from "@/components/table/data-table";
import type { DataTableColumn, DataTableSort } from "@/components/table/data-table.types";
import { exportTable } from "@/components/table/table-actions";

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleDateString("en-GB", { month: "long" }),
);

export function PayslipViewerPage({
  rows,
  totalCount,
  search,
  page,
  pageSize,
  sort,
  employeeId,
  month,
  year,
  employees,
  years,
  hasAny,
}: {
  rows: PayslipListRow[];
  totalCount: number;
  search: string;
  page: number;
  pageSize: number;
  sort: DataTableSort;
  employeeId: string;
  month: string;
  year: string;
  employees: { id: number; name: string }[];
  years: string[];
  hasAny: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<string[]>([]);

  function replaceQuery(next: {
    search?: string;
    page?: number;
    pageSize?: number;
    sort?: DataTableSort;
    employee?: string;
    month?: string;
    year?: string;
  }) {
    setSelected([]);
    router.push(
      `${pathname}${payrollQuery({
        search: next.search ?? search,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sort: next.sort ?? sort,
        extra: {
          employee: next.employee ?? employeeId,
          month: next.month ?? month,
          year: next.year ?? year,
        },
      })}`,
    );
  }

  const selectedRows = rows.filter((row) => selected.includes(row.key));
  const printRows = selectedRows.length > 0 ? selectedRows : rows;
  const printRunIds = [...new Set(printRows.map((row) => row.runId))];
  const singleMonth = Boolean(month && year && rows.length > 0 && printRunIds.length === 1);
  const printRunId = selectedRows.length > 0 && printRunIds.length === 1 ? printRunIds[0] : singleMonth ? printRunIds[0] : null;
  const printHref = printRunId
    ? `/payroll/monthly/${printRunId}/payslips${
        selectedRows.length > 0
          ? `?employees=${encodeURIComponent(selectedRows.map((row) => row.employeeId).join(","))}`
          : employeeId
            ? `?employees=${encodeURIComponent(employeeId)}`
            : ""
      }`
    : null;

  const columns = useMemo<DataTableColumn<PayslipListRow>[]>(
    () => [
      {
        key: "select",
        label: "",
        sortable: false,
        render: (row) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.employeeName}`}
            checked={selected.includes(row.key)}
            onChange={(event) =>
              setSelected((current) =>
                event.target.checked ? [...current, row.key] : current.filter((key) => key !== row.key),
              )
            }
          />
        ),
      },
      {
        key: "index",
        label: "Sr. No.",
        sortable: false,
        render: (_row, rowIndex) => (page - 1) * pageSize + rowIndex + 1,
      },
      { key: "employeeCode", label: "Employee code" },
      { key: "employeeName", label: "Employee name" },
      { key: "period", label: "Month", render: (row) => formatPeriod(row.period) },
      {
        key: "netPay",
        label: "Net pay",
        render: (row) => <span className="font-semibold text-zinc-900">{formatMoney(row.netPay)}</span>,
      },
      { key: "runStatus", label: "Status", render: (row) => <RunStatusBadge status={row.runStatus} /> },
      {
        key: "actions",
        label: "Payslip",
        sortable: false,
        render: (row) => (
          <Link
            href={`/payroll/monthly/${row.runId}/payslips?employees=${encodeURIComponent(String(row.employeeId))}`}
            className={linkButtonClass}
          >
            View
          </Link>
        ),
      },
    ],
    [page, pageSize, selected],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-zinc-800">Payslips</h1>
        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">{totalCount}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Employee"
          value={employeeId}
          onChange={(event) => replaceQuery({ employee: event.target.value, page: 1 })}
          className={`${formControlClass} h-9 w-56`}
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} ({employee.id})
            </option>
          ))}
        </select>
        <select
          aria-label="Month"
          value={month}
          onChange={(event) => replaceQuery({ month: event.target.value, page: 1 })}
          className={`${formControlClass} h-9`}
        >
          <option value="">All months</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={year}
          onChange={(event) => replaceQuery({ year: event.target.value, page: 1 })}
          className={`${formControlClass} h-9`}
        >
          <option value="">All years</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void listPayslipsAction({
                search,
                page: 1,
                pageSize: 100000,
                sortKey: sort.key ?? "",
                sortDirection: sort.direction === "desc" ? "desc" : "asc",
                status: "",
                employeeId,
                month,
                year,
              }).then((result) => exportTable(`payslips${year ? `-${year}` : ""}${month ? `-${month}` : ""}.csv`, columns, result.rows));
            }}
            disabled={totalCount === 0}
            className={secondaryButtonClass}
          >
            <Download className="size-4" />
            Export to Excel
          </button>
          {printHref ? (
            <Link href={printHref} className={primaryButtonClass}>
              <Printer className="size-4" />
              {selectedRows.length > 0 ? `Print selected (${selectedRows.length})` : `Print all (${totalCount})`}
            </Link>
          ) : (
            <span title="Choose a single month to print payslips in bulk" className={`${primaryButtonClass} cursor-not-allowed opacity-40`}>
              <Printer className="size-4" />
              Print
            </span>
          )}
        </span>
      </div>
      {!printHref && rows.length > 0 ? (
        <p className="text-xs text-zinc-500">Choose a single month and year to print payslips in bulk.</p>
      ) : null}
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
        searchPlaceholder="Search payslips…"
        emptyMessage={
          hasAny ? "No payslips match these filters" : "No payslips yet. Payslips appear here once a payroll is approved."
        }
      />
    </div>
  );
}
