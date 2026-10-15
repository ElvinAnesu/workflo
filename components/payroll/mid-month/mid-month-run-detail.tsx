"use client";

import { AlertTriangle, ArrowLeft, Download, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  approveMidMonthAction,
  deleteMidMonthAction,
  lockMidMonthAction,
  recalculateMidMonthAction,
  reopenMidMonthAction,
  setMidMonthAmountAction,
} from "@/app/(app)/payroll/actions";
import { linkButtonClass, primaryButtonClass, secondaryButtonClass } from "@/components/form/form-dialog-frame";
import { formControlClass, formControlSearchClass } from "@/components/form/form-control";
import { downloadCsv } from "@/components/payroll/csv-export";
import { basisLabel, midMonthBankTotals, midMonthTotals } from "@/components/payroll/mid-month";
import { formatMoney, parseAmount } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import {
  MID_MONTH_BASES,
  type MidMonthBasis,
  type MidMonthLine,
  type PayrollRunStatus,
} from "@/components/payroll/payroll.types";
import {
  cardClass,
  RunMessageBar,
  runMeta,
  RunWorkflowBar,
  Stepper,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
  Tile,
  type RunMessage,
} from "@/components/payroll/run-parts";
import { RunStatusBadge } from "@/components/payroll/run-status-badge";

export type MidMonthDetail = {
  id: number;
  period: string;
  status: PayrollRunStatus;
  basis: MidMonthBasis;
  value: number;
  paymentDate: string;
  createdOn: string;
  calculatedOn: string;
  approvedBy: string;
  approvedOn: string;
  lockedOn: string;
  lines: (MidMonthLine & { employeeCode?: string })[];
  excluded: { employeeId: string; employeeName: string; reason: string }[];
  monthly: { id: number; status: PayrollRunStatus } | null;
};

function codeOf(line: MidMonthLine & { employeeCode?: string }) {
  return line.employeeCode || line.employeeId;
}

function AmountInput({ run, line }: { run: MidMonthDetail; line: MidMonthDetail["lines"][number] }) {
  const router = useRouter();
  const [text, setText] = useState(String(line.amount));

  function commit() {
    const value = parseAmount(text || "0");
    if (!Number.isFinite(value) || value < 0) {
      setText(String(line.amount));
      return;
    }
    if (value !== line.amount) {
      void setMidMonthAmountAction(run.id, Number(line.employeeId), value).then(() => router.refresh());
    }
  }

  return (
    <input
      aria-label={`Mid-month amount for ${line.employeeName}`}
      inputMode="decimal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={`${formControlClass} w-28 text-right tabular-nums`}
    />
  );
}

function exportPayments(run: MidMonthDetail) {
  downloadCsv(
    `mid-month-payroll-${run.period}.csv`,
    ["Employee code", "Employee name", "Department", "Designation", "Basic salary", "Estimated net pay", "Mid-month amount", "Bank", "Account number"],
    run.lines
      .filter((line) => line.amount > 0)
      .map((line) => [
        codeOf(line),
        line.employeeName,
        line.department,
        line.designation,
        line.basicSalary,
        line.estimatedNet,
        line.amount,
        line.bankName,
        line.accountNumber,
      ]),
  );
}

function SetupEditor({ run, onDone }: { run: MidMonthDetail; onDone: (message: RunMessage) => void }) {
  const router = useRouter();
  const [basis, setBasis] = useState<MidMonthBasis>(run.basis);
  const [value, setValue] = useState(String(run.value));
  const [paymentDate, setPaymentDate] = useState(run.paymentDate);

  async function handleApply() {
    if (!paymentDate.startsWith(`${run.period}-`)) {
      onDone({ tone: "error", text: `The payment date must be in ${formatPeriod(run.period)}.` });
      return;
    }
    const result = await recalculateMidMonthAction(run.id, {
      basis,
      value: parseAmount(value || "0"),
      paymentDate,
    });
    if ("error" in result && result.error) {
      onDone({ tone: "error", text: result.error });
      return;
    }
    router.refresh();
    onDone({ tone: "ok", text: "Amounts recalculated on the new basis." });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
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
        <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} className={`${formControlClass} w-32`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-600">
        Payment date
        <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={formControlClass} />
      </label>
      <button
        type="button"
        onClick={() => {
          void handleApply();
        }}
        className={primaryButtonClass}
      >
        Apply
      </button>
      <button type="button" onClick={() => onDone(null)} className={secondaryButtonClass}>
        Cancel
      </button>
    </div>
  );
}

export function MidMonthRunDetail({ run }: { run: MidMonthDetail | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editingSetup, setEditingSetup] = useState(false);
  const [message, setMessage] = useState<RunMessage>(null);

  if (!run) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Link href="/payroll/mid-month" className={`${linkButtonClass} inline-flex items-center gap-1`}>
          <ArrowLeft className="size-3.5" />
          Mid-month payroll
        </Link>
        <p className="text-sm text-zinc-500">This payroll was not found.</p>
      </div>
    );
  }

  const current = run;
  const isDraft = current.status === "Draft";
  const totals = midMonthTotals(current.lines);
  const banks = midMonthBankTotals(current.lines);
  const flagged = current.lines.filter((line) => line.warnings.length > 0);
  const monthly = current.monthly;
  const term = search.trim().toLowerCase();
  const visibleLines = term
    ? current.lines.filter((line) =>
        [codeOf(line), line.employeeName, line.department].join(" ").toLowerCase().includes(term),
      )
    : current.lines;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/payroll/mid-month" className={`${linkButtonClass} inline-flex items-center gap-1`}>
            <ArrowLeft className="size-3.5" />
            Mid-month payroll
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-zinc-900">Mid-month payroll · {formatPeriod(current.period)}</h1>
            <RunStatusBadge status={current.status} />
          </div>
          <p className="text-xs text-zinc-500">{runMeta(current)}</p>
        </div>
        <Stepper status={current.status} />
      </div>

      <RunWorkflowBar
        status={current.status}
        onRecalculate={() => {
          void recalculateMidMonthAction(current.id).then((result) => {
            setMessage(
              "error" in result && result.error
                ? { tone: "error", text: result.error }
                : { tone: "ok", text: "Recalculated with the latest employee and pay data. Amounts changed by hand were kept." },
            );
            if (!("error" in result && result.error)) {
              router.refresh();
            }
          });
        }}
        onApprove={(approver) => {
          void approveMidMonthAction(current.id, approver).then((result) => {
            if ("error" in result && result.error) {
              setMessage({ tone: "error", text: result.error });
              return;
            }
            setMessage({ tone: "ok", text: "Mid-month payroll approved." });
            router.refresh();
          });
        }}
        approveBlockedReason={totals.employees === 0 ? "No one is being paid" : undefined}
        onReopen={() => {
          void reopenMidMonthAction(current.id).then((result) => {
            if ("error" in result && result.error) {
              setMessage({ tone: "error", text: result.error });
              return;
            }
            router.refresh();
          });
        }}
        onLock={() => {
          if (
            window.confirm(
              `Lock the ${formatPeriod(current.period)} mid-month payroll? The amounts become final and are deducted from the ${formatPeriod(current.period)} monthly payroll.`,
            )
          ) {
            void lockMidMonthAction(current.id).then((result) => {
              setMessage(
                "error" in result && result.error
                  ? { tone: "error", text: result.error }
                  : { tone: "ok", text: "Locked. The payments will be deducted in the monthly payroll." },
              );
              if (!("error" in result && result.error)) {
                router.refresh();
              }
            });
          }
        }}
        onDelete={() => {
          if (window.confirm(`Delete the draft ${formatPeriod(current.period)} mid-month payroll?`)) {
            void deleteMidMonthAction(current.id).then((result) => {
              if ("error" in result && result.error) {
                setMessage({ tone: "error", text: result.error });
                return;
              }
              router.push("/payroll/mid-month");
            });
          }
        }}
        onMessage={setMessage}
      >
        <button
          type="button"
          onClick={() => exportPayments(current)}
          disabled={totals.employees === 0}
          className={secondaryButtonClass}
        >
          <Download className="size-4" />
          Export to Excel
        </button>
      </RunWorkflowBar>

      <RunMessageBar message={message} />

      <div className="flex flex-col gap-2 rounded-md border border-zinc-200 px-3 py-2.5 text-xs text-zinc-600">
        {editingSetup ? (
          <SetupEditor
            run={current}
            onDone={(next) => {
              setMessage(next);
              if (next?.tone !== "error") setEditingSetup(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Paying <span className="font-medium text-zinc-900">{basisLabel(current.basis, current.value)}</span> on{" "}
              <span className="font-medium text-zinc-900">{current.paymentDate}</span>
            </span>
            {isDraft ? (
              <button type="button" onClick={() => setEditingSetup(true)} className={linkButtonClass}>
                Change
              </button>
            ) : null}
            <span className="text-zinc-400">·</span>
            {current.status === "Locked" ? (
              monthly ? (
                <span>
                  Deducted in the{" "}
                  <Link href={`/payroll/monthly/${monthly.id}`} className={linkButtonClass}>
                    {formatPeriod(current.period)} payroll
                  </Link>{" "}
                  ({monthly.status.toLowerCase()}
                  {monthly.status === "Draft" ? ", recalculate it if it was run before this was locked" : ""})
                </span>
              ) : (
                <span>Deducted when the {formatPeriod(current.period)} monthly payroll is run.</span>
              )
            ) : (
              <span>Deducted from the monthly payroll once locked.</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Employees paid"
          value={String(totals.employees)}
          note={current.excluded.length > 0 ? `${current.excluded.length} not eligible` : undefined}
        />
        <Tile label="Total to pay" value={formatMoney(totals.amount)} />
        <Tile
          label="Share of basic salary"
          value={totals.basicSalary > 0 ? `${Math.round((totals.amount / totals.basicSalary) * 1000) / 10}%` : "—"}
        />
        <Tile label="Above estimated net" value={String(current.lines.filter((line) => line.amount > line.estimatedNet).length)} />
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
                is not paid: {item.reason}.
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
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800">Payments</h2>
            {isDraft ? (
              <p className="text-xs text-zinc-500">Change an amount to pay someone more or less; enter 0 to leave them out.</p>
            ) : null}
          </div>
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
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-zinc-50">
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Employee code</th>
                <th className={thClass}>Employee name</th>
                <th className={thClass}>Department</th>
                <th className={thNumClass}>Basic salary</th>
                <th className={thNumClass}>Estimated net pay</th>
                <th className={thNumClass}>Mid-month amount</th>
                <th className={thClass}>Bank</th>
                <th className={thClass}>Account</th>
                <th className={thClass}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line, index) => (
                <tr
                  key={line.employeeId}
                  className={`border-t border-zinc-100 ${line.warnings.length > 0 ? "bg-amber-50/40" : ""} ${line.amount === 0 ? "text-zinc-400" : ""}`}
                >
                  <td className={tdClass}>{index + 1}</td>
                  <td className={tdClass}>{codeOf(line)}</td>
                  <td className={`${tdClass} text-zinc-900`}>{line.employeeName}</td>
                  <td className={tdClass}>{line.department || "—"}</td>
                  <td className={tdNumClass}>{formatMoney(line.basicSalary)}</td>
                  <td className={tdNumClass}>{formatMoney(line.estimatedNet)}</td>
                  <td className={tdNumClass}>
                    {isDraft ? (
                      <span className="inline-flex items-center gap-2">
                        <AmountInput key={`${line.employeeId}-${line.amount}`} run={current} line={line} />
                        {line.overridden ? (
                          <button
                            type="button"
                            title={`Back to ${formatMoney(line.defaultAmount)}`}
                            onClick={() => {
                              void setMidMonthAmountAction(current.id, Number(line.employeeId), null).then(() => router.refresh());
                            }}
                            className={linkButtonClass}
                          >
                            Reset
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span className="font-semibold text-zinc-900">{formatMoney(line.amount)}</span>
                    )}
                  </td>
                  <td className={tdClass}>{line.bankName || "—"}</td>
                  <td className={tdClass}>{line.accountNumber || "—"}</td>
                  <td className={tdClass}>
                    <span className="flex items-center gap-2">
                      {line.amount === 0 ? <span>Not paid</span> : null}
                      {line.overridden && line.amount > 0 ? <span className="text-blue-700">Changed by hand</span> : null}
                      {line.warnings.map((warning) => (
                        <span key={warning} className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="size-3.5" />
                          {warning}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {visibleLines.length > 0 ? (
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className={`${tdClass} font-semibold text-zinc-900`} colSpan={6}>
                    Total ({totals.employees} paid)
                  </td>
                  <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.amount)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
          {visibleLines.length === 0 ? (
            <p className="border-t border-zinc-200 px-3 py-10 text-center text-xs text-zinc-500">
              {current.lines.length === 0 ? "No eligible employees" : "No employees match"}
            </p>
          ) : null}
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden xl:max-w-2xl`}>
        <div className="p-4">
          <h2 className="text-sm font-semibold text-zinc-800">Bank payments</h2>
          <p className="text-xs text-zinc-500">Amounts to transfer, by bank.</p>
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
                <td className={`${tdClass} ${bank.bankName === "No bank" ? "text-amber-700" : "text-zinc-900"}`}>{bank.bankName}</td>
                <td className={tdNumClass}>{bank.count}</td>
                <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(bank.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-zinc-200 bg-zinc-50">
              <td className={`${tdClass} font-semibold text-zinc-900`}>Total</td>
              <td className={tdNumClass}>{totals.employees}</td>
              <td className={`${tdNumClass} font-semibold text-zinc-900`}>{formatMoney(totals.amount)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
