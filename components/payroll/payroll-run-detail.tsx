"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Info,
  Download,
  FileText,
  Lock,
  PauseCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  approveMonthlyAction,
  deleteMonthlyAction,
  lockMonthlyAction,
  recalculateMonthlyAction,
  reopenMonthlyAction,
} from "@/app/(app)/payroll/actions";
import {
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form/form-dialog-frame";
import {
  formControlClass,
  formControlSearchClass,
} from "@/components/form/form-control";
import { downloadCsv } from "@/components/payroll/csv-export";
import { formatMoney } from "@/components/payroll/payroll-format";
import {
  bankTotals,
  contributionTotals,
  formatPeriod,
  payrollTotals,
} from "@/components/payroll/payroll-run-builder";
import type { PayrollLine, PayrollRun, PayrollRunStatus } from "@/components/payroll/payroll.types";
import { inputKind, type InputKind } from "@/components/payroll/payroll-inputs";
import {
  cardClass,
  Stepper,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
  Tile,
} from "@/components/payroll/run-parts";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";

const invalidClass = "h-7 rounded-md border border-red-500 bg-red-50 px-2 text-xs text-zinc-700 outline-none";

type MonthlyLine = PayrollLine & { employeeCode?: string };
export type MonthlyRunView = Omit<PayrollRun, "id" | "lines" | "status"> & {
  id: number;
  status: PayrollRunStatus;
  lines: MonthlyLine[];
};

function codeOf(line: MonthlyLine) {
  return line.employeeCode || line.employeeId;
}

function asPayrollRun(run: MonthlyRunView): PayrollRun {
  return { ...run, id: String(run.id) };
}

function exportRegister(run: MonthlyRunView) {
  const contributionHeaders = run.contributionColumns.flatMap((column) => [
    `${column.code} employee`,
    `${column.code} employer`,
  ]);
  const headers = [
    "Employee code",
    "Employee name",
    "Department",
    "Designation",
    "Basic salary",
    "Other earnings",
    "Gross pay",
    ...contributionHeaders,
    "Taxable income",
    "PAYE",
    "Other deductions",
    "Total deductions",
    "Net pay",
    "Employer cost",
    "Bank",
    "Account number",
    "On hold",
  ];
  const rows = run.lines.map((line) => [
    codeOf(line),
    line.employeeName,
    line.department,
    line.designation,
    line.basicSalary,
    Math.round((line.grossPay - line.basicSalary) * 100) / 100,
    line.grossPay,
    ...run.contributionColumns.flatMap((column) => {
      const item = line.contributions.find(
        (contribution) => contribution.contributionId === column.contributionId,
      );
      return [item?.employee ?? 0, item?.employer ?? 0];
    }),
    line.taxableIncome,
    line.paye,
    line.otherDeductions,
    line.totalDeductions,
    line.netPay,
    line.employerCost,
    line.bankName,
    line.accountNumber,
    line.held ? "Yes" : "No",
  ]);
  downloadCsv(`payroll-register-${run.period}.csv`, headers, rows);
}

const INPUT_LINKS: Record<InputKind, { label: string; href: string; earning: boolean }> = {
  Overtime: { label: "Overtime", href: "/payroll/overtime", earning: true },
  "Mid-month": { label: "Mid-month payments", href: "/payroll/mid-month", earning: false },
  Loan: { label: "Loan repayments", href: "/payroll/loans", earning: false },
  Advance: { label: "Salary advance recoveries", href: "/payroll/advances", earning: false },
  Recovery: { label: "Payment recoveries", href: "/payroll/recoveries", earning: false },
};

function InputsSummary({ lines }: { lines: PayrollLine[] }) {
  const totals = new Map<InputKind, { employees: Set<string>; amount: number }>();
  for (const line of lines) {
    for (const item of [...line.earnings, ...line.deductions]) {
      const kind = inputKind(item);
      if (!kind) {
        continue;
      }
      const total = totals.get(kind) ?? { employees: new Set<string>(), amount: 0 };
      total.employees.add(line.employeeId);
      total.amount = Math.round((total.amount + item.amount) * 100) / 100;
      totals.set(kind, total);
    }
  }
  if (totals.size === 0) {
    return null;
  }
  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="p-4">
        <h2 className="text-sm font-semibold text-zinc-800">Payroll inputs</h2>
        <p className="text-xs text-zinc-500">
          Overtime, mid-month payments and repayments included in this payroll.
        </p>
      </div>
      <table className="min-w-full border-collapse">
        <thead className="bg-zinc-50">
          <tr>
            <th className={thClass}>Input</th>
            <th className={thClass}>Type</th>
            <th className={thNumClass}>Employees</th>
            <th className={thNumClass}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(INPUT_LINKS) as InputKind[])
            .filter((kind) => totals.has(kind))
            .map((kind) => (
              <tr key={kind} className="border-t border-zinc-100">
                <td className={tdClass}>
                  <Link href={INPUT_LINKS[kind].href} className={linkButtonClass}>
                    {INPUT_LINKS[kind].label}
                  </Link>
                </td>
                <td className={tdClass}>{INPUT_LINKS[kind].earning ? "Earning" : "Deduction"}</td>
                <td className={tdNumClass}>{totals.get(kind)!.employees.size}</td>
                <td className={`${tdNumClass} font-semibold text-zinc-900`}>
                  {formatMoney(totals.get(kind)!.amount)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

function RegisterTable({ run, lines }: { run: MonthlyRunView; lines: MonthlyLine[] }) {
  const totals = payrollTotals(lines);
  const contributionSum = (contributionId: string) =>
    Math.round(
      lines.reduce(
        (sum, line) =>
          sum +
          (line.contributions.find((item) => item.contributionId === contributionId)
            ?.employee ?? 0),
        0,
      ) * 100,
    ) / 100;
  const employeeColumns = run.contributionColumns.filter((column) =>
    run.lines.some((line) =>
      line.contributions.some(
        (item) => item.contributionId === column.contributionId && item.employee > 0,
      ),
    ),
  );

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200">
      <table className="min-w-full border-collapse">
        <thead className="bg-zinc-50">
          <tr>
            <th className={thClass}>#</th>
            <th className={thClass}>Employee code</th>
            <th className={thClass}>Employee name</th>
            <th className={thClass}>Department</th>
            <th className={thNumClass}>Basic salary</th>
            <th className={thNumClass}>Gross pay</th>
            {employeeColumns.map((column) => (
              <th key={column.contributionId} className={thNumClass}>
                {column.code}
              </th>
            ))}
            <th className={thNumClass}>Taxable income</th>
            <th className={thNumClass}>PAYE</th>
            <th className={thNumClass}>Other deductions</th>
            <th className={thNumClass}>Net pay</th>
            <th className={thClass}>Notes</th>
            <th className={thClass}>Payslip</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={line.employeeId}
              className={`border-t border-zinc-100 ${
                line.warnings.length > 0 ? "bg-amber-50/40" : ""
              }`}
            >
              <td className={tdClass}>{index + 1}</td>
              <td className={tdClass}>{codeOf(line)}</td>
              <td className={`${tdClass} text-zinc-900`}>{line.employeeName}</td>
              <td className={tdClass}>{line.department || "—"}</td>
              <td className={tdNumClass}>{formatMoney(line.basicSalary)}</td>
              <td className={tdNumClass}>{formatMoney(line.grossPay)}</td>
              {employeeColumns.map((column) => (
                <td key={column.contributionId} className={tdNumClass}>
                  {formatMoney(
                    line.contributions.find(
                      (item) => item.contributionId === column.contributionId,
                    )?.employee ?? 0,
                  )}
                </td>
              ))}
              <td className={tdNumClass}>{formatMoney(line.taxableIncome)}</td>
              <td className={tdNumClass}>{formatMoney(line.paye)}</td>
              <td className={tdNumClass}>{formatMoney(line.otherDeductions)}</td>
              <td
                className={`${tdNumClass} font-semibold ${
                  line.netPay < 0 ? "text-red-600" : "text-zinc-900"
                }`}
              >
                {formatMoney(line.netPay)}
              </td>
              <td className={tdClass}>
                <span className="flex items-center gap-2">
                  {line.held ? (
                    <span
                      title={line.holdReason}
                      className="inline-flex items-center gap-1 text-indigo-700"
                    >
                      <PauseCircle className="size-3.5" />
                      On hold
                    </span>
                  ) : null}
                  {line.warnings.map((warning) => (
                    <span
                      key={warning}
                      className="inline-flex items-center gap-1 text-amber-700"
                    >
                      <AlertTriangle className="size-3.5" />
                      {warning}
                    </span>
                  ))}
                </span>
              </td>
              <td className={tdClass}>
                <Link
                  href={`/payroll/monthly/${run.id}/payslips?employees=${encodeURIComponent(line.employeeId)}`}
                  className={linkButtonClass}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
        {lines.length > 0 ? (
          <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
            <tr>
              <td className={`${tdClass} font-semibold text-zinc-900`} colSpan={4}>
                Total ({totals.employees} employees)
              </td>
              <td className={`${tdNumClass} font-semibold`}>{formatMoney(totals.basicSalary)}</td>
              <td className={`${tdNumClass} font-semibold`}>{formatMoney(totals.grossPay)}</td>
              {employeeColumns.map((column) => (
                <td key={column.contributionId} className={`${tdNumClass} font-semibold`}>
                  {formatMoney(contributionSum(column.contributionId))}
                </td>
              ))}
              <td className={`${tdNumClass} font-semibold`}>
                {formatMoney(
                  Math.round(lines.reduce((sum, line) => sum + line.taxableIncome, 0) * 100) / 100,
                )}
              </td>
              <td className={`${tdNumClass} font-semibold`}>{formatMoney(totals.paye)}</td>
              <td className={`${tdNumClass} font-semibold`}>{formatMoney(totals.otherDeductions)}</td>
              <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.netPay)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        ) : null}
      </table>
      {lines.length === 0 ? (
        <p className="border-t border-zinc-200 px-3 py-10 text-center text-xs text-zinc-500">
          No employees match
        </p>
      ) : null}
    </div>
  );
}

export function PayrollRunDetail({
  run,
  notices,
  search,
}: {
  run: MonthlyRunView | null;
  notices: { text: string; href: string }[];
  search: string;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [approver, setApprover] = useState("");
  const [approverSubmitted, setApproverSubmitted] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  if (!run) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/payroll/monthly" className={`${linkButtonClass} inline-flex items-center gap-1`}>
          <ArrowLeft className="size-3.5" />
          Monthly payroll
        </Link>
        <p className="text-sm text-zinc-500">This payroll was not found.</p>
      </div>
    );
  }

  const current = run;
  const totals = payrollTotals(current.lines);
  const statutory = contributionTotals(asPayrollRun(current));
  const banks = bankTotals(current.lines);
  const flagged = current.lines.filter((line) => line.warnings.length > 0);
  const visibleLines = current.lines;
  const isDraft = current.status === "Draft";
  const blocking = current.lines.filter((line) => line.netPay < 0);

  function setSearch(value: string) {
    const params = new URLSearchParams();
    if (value) {
      params.set("search", value);
    }
    const query = params.toString();
    router.replace(`/payroll/monthly/${current.id}${query ? `?${query}` : ""}`);
  }

  async function handleRecalculate() {
    const result = await recalculateMonthlyAction(current.id);
    setMessage(
      "error" in result && result.error
        ? { tone: "error", text: result.error }
        : {
            tone: "ok",
            text: "Payroll recalculated with the latest employee, settings, overtime, mid-month and repayment data.",
          },
    );
    if (!("error" in result && result.error)) {
      router.refresh();
    }
  }

  async function handleApprove() {
    setApproverSubmitted(true);
    if (!approver.trim()) {
      setMessage({ tone: "error", text: "Enter the approver's name." });
      return;
    }
    const result = await approveMonthlyAction(current.id, approver.trim());
    if ("error" in result && result.error) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setApproving(false);
    setMessage({ tone: "ok", text: "Payroll approved." });
    router.refresh();
  }

  async function handleLock() {
    if (
      window.confirm(
        `Lock the ${formatPeriod(current.period)} payroll? Locked payrolls cannot be changed or recalculated, and payslips are final.`,
      )
    ) {
      const result = await lockMonthlyAction(current.id);
      if ("error" in result && result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "ok", text: "Payroll locked. Payslips are final." });
      router.refresh();
    }
  }

  async function handleDelete() {
    if (window.confirm(`Delete the draft ${formatPeriod(current.period)} payroll?`)) {
      const result = await deleteMonthlyAction(current.id);
      if ("error" in result && result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      router.push("/payroll/monthly");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/payroll/monthly"
            className={`${linkButtonClass} inline-flex items-center gap-1 print:hidden`}
          >
            <ArrowLeft className="size-3.5" />
            Monthly payroll
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-900">
              Payroll · {formatPeriod(current.period)}
            </h1>
            <RunStatusBadge status={current.status} />
          </div>
          <p className="text-xs text-zinc-500">
            {[
              current.calculatedOn
                ? `Calculated ${new Date(current.calculatedOn).toLocaleString("en-GB")}`
                : "",
              current.approvedOn ? `approved by ${current.approvedBy} on ${current.approvedOn}` : "",
              current.lockedOn ? `locked on ${current.lockedOn}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Stepper status={current.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {isDraft ? (
          <>
            <button
              type="button"
              onClick={() => {
                void handleRecalculate();
              }}
              className={secondaryButtonClass}
            >
              <RefreshCw className="size-4" />
              Recalculate
            </button>
            {approving ? (
              <span className="flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="Approver name"
                  value={approver}
                  onChange={(event) => setApprover(event.target.value)}
                  className={approverSubmitted && !approver.trim() ? `${invalidClass} w-48` : `${formControlClass} h-9 w-48`}
                />
                <button
                  type="button"
                  onClick={() => {
                    void handleApprove();
                  }}
                  className={primaryButtonClass}
                >
                  Confirm approval
                </button>
                <button
                  type="button"
                  onClick={() => setApproving(false)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={blocking.length > 0 || current.lines.length === 0}
                title={
                  blocking.length > 0
                    ? "Fix employees with negative net pay first"
                    : undefined
                }
                onClick={() => setApproving(true)}
                className={primaryButtonClass}
              >
                <Check className="size-4" />
                Approve
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void handleDelete();
              }}
              className="inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete draft
            </button>
          </>
        ) : null}
        {current.status === "Approved" ? (
          <>
            <button
              type="button"
              onClick={() => {
                void handleLock();
              }}
              className={primaryButtonClass}
            >
              <Lock className="size-4" />
              Lock payroll
            </button>
            <button
              type="button"
              onClick={() => {
                void reopenMonthlyAction(current.id).then((result) => {
                  if ("error" in result && result.error) {
                    setMessage({ tone: "error", text: result.error });
                    return;
                  }
                  router.refresh();
                });
              }}
              className={secondaryButtonClass}
            >
              Back to draft
            </button>
          </>
        ) : null}
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => exportRegister(current)} className={secondaryButtonClass}>
            <Download className="size-4" />
            Export to Excel
          </button>
          <Link href={`/payroll/monthly/${current.id}/payslips`} className={secondaryButtonClass}>
            <FileText className="size-4" />
            All payslips
          </Link>
        </span>
      </div>

      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-xs ${
            message.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      {isDraft ? (
        <p className="text-xs text-zinc-500">
          Changes to employees, pay setup, holds, settings, overtime, mid-month
          payments, loans, advances or recoveries are picked up when
          you recalculate. Approved and locked payrolls keep their figures.
        </p>
      ) : null}

      {notices.map((notice) => (
        <p
          key={notice.href}
          className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
        >
          <Info className="mt-px size-4 shrink-0" />
          <span>
            {notice.text}{" "}
            <Link href={notice.href} className="font-medium underline">
              Open
            </Link>
          </span>
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="Employees paid" value={String(totals.employees)} />
        <Tile label="Gross pay" value={formatMoney(totals.grossPay)} />
        <Tile label="PAYE" value={formatMoney(totals.paye)} />
        <Tile
          label="Employee contributions"
          value={formatMoney(totals.employeeContributions)}
        />
        <Tile
          label="Net payable"
          value={formatMoney(totals.netPayable)}
          note={totals.netHeld > 0 ? `${formatMoney(totals.netHeld)} on hold` : undefined}
        />
        <Tile
          label="Total employer cost"
          value={formatMoney(totals.employerCost)}
          note={`incl. ${formatMoney(totals.employerContributions)} employer contributions`}
        />
      </div>

      {flagged.length > 0 || current.excluded.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-4" />
            Needs attention ({flagged.length + current.excluded.length})
          </h2>
          <ul className="flex flex-col gap-1 text-xs text-amber-900">
            {current.excluded.map((item) => (
              <li key={item.employeeId}>
                <span className="font-medium">
                  {item.employeeId} · {item.employeeName}
                </span>{" "}
                was not paid: {item.reason}.{" "}
                {isDraft ? (
                  <Link href="/payroll/component-assignment" className="underline">
                    Set up pay
                  </Link>
                ) : null}
              </li>
            ))}
            {flagged.map((line) => (
              <li key={line.employeeId}>
                <span className="font-medium">
                  {codeOf(line)} · {line.employeeName}
                </span>
                : {line.warnings.join("; ")}
              </li>
            ))}
          </ul>
          {blocking.length > 0 ? (
            <p className="text-xs font-medium text-red-700">
              Approval is blocked until no employee has negative net pay.
            </p>
          ) : null}
        </section>
      ) : null}

      <InputsSummary lines={current.lines} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-800">Payroll register</h2>
          <label className="relative block w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees…"
              className={formControlSearchClass}
            />
          </label>
        </div>
        <RegisterTable run={current} lines={visibleLines} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className={`${cardClass} overflow-hidden`}>
          <div className="p-4">
            <h2 className="text-sm font-semibold text-zinc-800">Statutory remittance</h2>
            <p className="text-xs text-zinc-500">Amounts due to each authority for this month.</p>
          </div>
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50">
              <tr>
                <th className={thClass}>Item</th>
                <th className={thNumClass}>Employees</th>
                <th className={thNumClass}>Employee share</th>
                <th className={thNumClass}>Employer share</th>
                <th className={thNumClass}>Total due</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-100">
                <td className={`${tdClass} text-zinc-900`}>PAYE</td>
                <td className={tdNumClass}>{current.lines.filter((line) => line.paye > 0).length}</td>
                <td className={tdNumClass}>{formatMoney(totals.paye)}</td>
                <td className={tdNumClass}>—</td>
                <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.paye)}</td>
              </tr>
              {statutory.map((item) => (
                <tr key={item.contributionId} className="border-t border-zinc-100">
                  <td className={`${tdClass} text-zinc-900`}>
                    {item.code}
                    <span className="ml-1 text-zinc-400">{item.name !== item.code ? item.name : ""}</span>
                  </td>
                  <td className={tdNumClass}>{item.members}</td>
                  <td className={tdNumClass}>{formatMoney(item.employee)}</td>
                  <td className={tdNumClass}>{formatMoney(item.employer)}</td>
                  <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={`${cardClass} overflow-hidden`}>
          <div className="p-4">
            <h2 className="text-sm font-semibold text-zinc-800">Bank payments</h2>
            <p className="text-xs text-zinc-500">
              Net pay to transfer, by bank. Held and zero or negative pay are excluded.
            </p>
          </div>
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50">
              <tr>
                <th className={thClass}>Bank</th>
                <th className={thNumClass}>Employees</th>
                <th className={thNumClass}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {banks.map((bank) => (
                <tr key={bank.bankName} className="border-t border-zinc-100">
                  <td className={`${tdClass} ${bank.bankName === "No bank" ? "text-amber-700" : "text-zinc-900"}`}>
                    {bank.bankName}
                  </td>
                  <td className={tdNumClass}>{bank.count}</td>
                  <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(bank.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-200 bg-zinc-50">
                <td className={`${tdClass} font-semibold text-zinc-900`}>Total payable</td>
                <td className={tdNumClass}>{banks.reduce((sum, bank) => sum + bank.count, 0)}</td>
                <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.netPayable)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
