"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  addRepaymentAction,
  approvePlanAction,
  closePlanAction,
  deleteRepaymentAction,
  getPlanAction,
  pausePlanAction,
  rejectPlanAction,
  resumePlanAction,
} from "@/app/(app)/payroll/actions";
import {
  FormField,
  linkButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form/form-dialog-frame";
import { formControlClass } from "@/components/form/form-control";
import { planSchedule, type PlanBalance } from "@/components/payroll/deduction-plans";
import { formatMoney, formatRate, parseAmount } from "@/components/payroll/payroll-format";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import type { DeductionPlan, DeductionPlanStatus, PayrollRun } from "@/components/payroll/payroll.types";
import { PLAN_COPY, PlanStatusBadge } from "@/components/payroll/plans/plan-copy";
import { tdClass, tdNumClass, thClass, thNumClass } from "@/components/payroll/run-parts";
import { todayIso } from "@/components/store/persistent-store";

type Mode = null | "approve" | "reject" | "repay" | "close";

type PlanDetail = {
  plan: DeductionPlan;
  numericId: number;
  balance: PlanBalance;
  displayStatus: DeductionPlanStatus | "Completed";
  employeeName: string;
  runs: PayrollRun[];
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-zinc-100 py-1.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-900">{children || "—"}</span>
    </div>
  );
}

function Amount({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-zinc-200 px-3 py-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? "text-zinc-900"}`}>{formatMoney(value)}</span>
    </div>
  );
}

function actionError(result: { error?: string } | { id?: number }) {
  return "error" in result && result.error ? result.error : "";
}

export function PlanDetailDialog({ planId, onClose }: { planId: number; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const result = await getPlanAction(planId);
    if ("error" in result) {
      setMissing(true);
      setDetail(null);
      return;
    }
    setMissing(false);
    setDetail({
      plan: result.plan,
      numericId: result.numericId,
      balance: result.balance,
      displayStatus: result.displayStatus,
      employeeName: result.employeeName,
      runs: result.runs,
    });
  }

  useEffect(() => {
    void load();
  }, [planId]);

  async function afterChange(result: Promise<{ error?: string } | { id?: number }>) {
    const problem = actionError(await result);
    if (problem) {
      setError(problem);
      return;
    }
    setMode(null);
    setError("");
    await load();
    router.refresh();
  }

  if (missing || !detail) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        {missing ? "This record no longer exists. " : "Loading… "}
        <button type="button" onClick={onClose} className={linkButtonClass}>
          Close
        </button>
      </div>
    );
  }

  const plan = detail.plan;
  const balance = detail.balance;
  const copy = PLAN_COPY[plan.kind];
  const status = detail.displayStatus;
  const schedule = planSchedule(plan, detail.runs);
  const recovered = balance.recoveredPayroll + balance.repaidManually;
  const progress = plan.total > 0 ? Math.min(100, (recovered / plan.total) * 100) : 0;
  const open = plan.status === "Active" || plan.status === "Paused";

  function openMode(next: Mode) {
    setMode(next);
    setError("");
    setName("");
    setNote("");
    setAmount("");
    setDate(todayIso());
  }

  function handleConfirm() {
    if (!detail) {
      return;
    }
    if (mode === "approve") {
      void afterChange(approvePlanAction(detail.numericId, name.trim(), copy.disbursed ? date : ""));
    } else if (mode === "reject") {
      void afterChange(rejectPlanAction(detail.numericId, note.trim()));
    } else if (mode === "close") {
      void afterChange(closePlanAction(detail.numericId, note.trim()));
    } else if (mode === "repay") {
      void afterChange(addRepaymentAction(detail.numericId, parseAmount(amount || "0"), date, note.trim()));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-800">
          {plan.id} · {detail.employeeName}
          <PlanStatusBadge status={status} />
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
        <section className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Amount label="Total to recover" value={plan.total} />
            <Amount label="Recovered" value={recovered} tone="text-emerald-700" />
            <Amount label="In open payrolls" value={balance.pendingPayroll} tone="text-blue-700" />
            <Amount
              label="Outstanding"
              value={balance.outstanding}
              tone={balance.outstanding > 0 ? "text-amber-700" : "text-zinc-900"}
            />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100" aria-label={`${Math.round(progress)}% recovered`}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-zinc-500">
            {Math.round(progress)}% recovered · {formatMoney(balance.recoveredPayroll)} through locked payrolls,{" "}
            {formatMoney(balance.repaidManually)} paid directly.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {copy.categoryLabel ? <Detail label={copy.categoryLabel}>{plan.category}</Detail> : null}
          <Detail label={copy.amountLabel}>{formatMoney(plan.principal)}</Detail>
          {plan.kind === "Loan" ? <Detail label="Interest">{formatRate(plan.interestRate)}</Detail> : null}
          <Detail label="Monthly deduction">{formatMoney(plan.installment)}</Detail>
          <Detail label="First deduction">{formatPeriod(plan.startPeriod)}</Detail>
          <Detail label={copy.reasonLabel}>{plan.reason}</Detail>
          <Detail label="Recorded on">{plan.requestedOn}</Detail>
          {copy.needsApproval ? (
            <Detail label="Approved">{plan.approvedOn ? `${plan.approvedBy}, ${plan.approvedOn}` : ""}</Detail>
          ) : null}
          {copy.disbursed ? <Detail label="Paid out on">{plan.disbursedOn}</Detail> : null}
          {plan.closedOn ? (
            <Detail label={plan.status === "Rejected" ? "Rejected" : "Closed"}>
              {plan.closedOn}
              {plan.closeReason ? ` · ${plan.closeReason}` : ""}
            </Detail>
          ) : null}
        </section>

        {mode ? (
          <section className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <h3 className="text-xs font-semibold text-zinc-800">
              {mode === "approve"
                ? `Approve ${copy.noun}`
                : mode === "reject"
                  ? `Reject ${copy.noun}`
                  : mode === "repay"
                    ? "Record direct repayment"
                    : `Close ${copy.noun}`}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {mode === "approve" ? (
                <>
                  <FormField label="Approver name">
                    <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className={formControlClass} />
                  </FormField>
                  {copy.disbursed ? (
                    <FormField label="Paid out on">
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={formControlClass} />
                    </FormField>
                  ) : null}
                </>
              ) : null}
              {mode === "repay" ? (
                <>
                  <FormField label="Amount">
                    <input
                      autoFocus
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className={formControlClass}
                    />
                  </FormField>
                  <FormField label="Date paid">
                    <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={formControlClass} />
                  </FormField>
                </>
              ) : null}
              {mode !== "approve" ? (
                <FormField
                  label={mode === "repay" ? "Note (receipt number, method)" : "Reason"}
                  className={mode === "repay" ? "" : "sm:col-span-3"}
                >
                  <input
                    autoFocus={mode !== "repay"}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={formControlClass}
                  />
                </FormField>
              ) : null}
            </div>
            {mode === "close" ? (
              <p className="text-[11px] text-zinc-500">
                No further deductions are made. The outstanding {formatMoney(balance.outstanding)} is written off.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleConfirm} className={primaryButtonClass}>
                Confirm
              </button>
              <button type="button" onClick={() => setMode(null)} className={secondaryButtonClass}>
                Cancel
              </button>
              {error ? <p className="text-xs text-red-600">{error}</p> : null}
            </div>
          </section>
        ) : (
          <section className="flex flex-wrap gap-2">
            {plan.status === "Pending" ? (
              <>
                <button type="button" onClick={() => openMode("approve")} className={primaryButtonClass}>
                  Approve
                </button>
                <button type="button" onClick={() => openMode("reject")} className={secondaryButtonClass}>
                  Reject
                </button>
              </>
            ) : null}
            {open && balance.outstanding > 0 ? (
              <>
                <button type="button" onClick={() => openMode("repay")} className={secondaryButtonClass}>
                  Record direct repayment
                </button>
                {plan.status === "Active" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!detail) {
                        return;
                      }
                      void afterChange(pausePlanAction(detail.numericId));
                    }}
                    className={secondaryButtonClass}
                  >
                    Pause deductions
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!detail) {
                        return;
                      }
                      void afterChange(resumePlanAction(detail.numericId));
                    }}
                    className={secondaryButtonClass}
                  >
                    Resume deductions
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openMode("close")}
                  className="inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  {plan.kind === "Loan" ? "Write off" : "Waive"}
                </button>
              </>
            ) : null}
          </section>
        )}

        {plan.status === "Paused" ? (
          <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            Deductions are paused. Payrolls calculated while paused skip this {copy.noun}.
          </p>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-800">Repayment schedule</h3>
          {schedule.length === 0 ? (
            <p className="text-xs text-zinc-500">Nothing scheduled.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="min-w-full border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={thClass}>Payroll month</th>
                    <th className={thClass}>Status</th>
                    <th className={thNumClass}>Deduction</th>
                    <th className={thNumClass}>Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => {
                    const payroll = detail.runs.find((item) => item.period === row.period);
                    return (
                      <tr key={row.period} className="border-t border-zinc-100">
                        <td className={tdClass}>
                          {row.source === "Projected" || !payroll ? (
                            formatPeriod(row.period)
                          ) : (
                            <Link href={`/payroll/monthly/${payroll.id}`} className={linkButtonClass}>
                              {formatPeriod(row.period)}
                            </Link>
                          )}
                        </td>
                        <td className={tdClass}>
                          {row.source === "Projected"
                            ? plan.status === "Active"
                              ? "Upcoming"
                              : "Not yet scheduled"
                            : row.source === "Locked"
                              ? "Deducted"
                              : `In ${row.source.toLowerCase()} payroll`}
                        </td>
                        <td className={tdNumClass}>{formatMoney(row.amount)}</td>
                        <td className={tdNumClass}>{formatMoney(row.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {plan.repayments.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-zinc-800">Direct repayments</h3>
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className="min-w-full border-collapse">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Note</th>
                    <th className={thNumClass}>Amount</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {plan.repayments.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-100">
                      <td className={tdClass}>{item.date}</td>
                      <td className={tdClass}>{item.note || "—"}</td>
                      <td className={tdNumClass}>{formatMoney(item.amount)}</td>
                      <td className={tdClass}>
                        {open ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!detail) {
                                return;
                              }
                              if (window.confirm("Remove this repayment?")) {
                                void afterChange(deleteRepaymentAction(detail.numericId, Number(item.id)));
                              }
                            }}
                            className="text-xs font-medium text-red-600"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
