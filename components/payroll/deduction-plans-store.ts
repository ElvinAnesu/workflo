"use client";

import { PLAN_ID_PREFIX, planBalance, planRunDeductions } from "@/components/payroll/deduction-plans";
import { round2 } from "@/components/payroll/payroll-engine";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import { newId, payrollStore, upsert } from "@/components/payroll/payroll-store";
import type {
  DeductionPlan,
  DeductionPlanKind,
  ManualRepayment,
} from "@/components/payroll/payroll.types";
import { prefixedId, todayIso } from "@/components/store/persistent-store";

export type PlanDraft = Pick<
  DeductionPlan,
  | "kind"
  | "employeeId"
  | "category"
  | "reason"
  | "principal"
  | "interestRate"
  | "total"
  | "installment"
  | "startPeriod"
> & { id?: string };

function updatePlan(id: string, change: (plan: DeductionPlan) => DeductionPlan) {
  payrollStore.setState((current) => ({
    ...current,
    plans: current.plans.map((plan) => (plan.id === id ? change(plan) : plan)),
  }));
}

// Problems with saving a plan; empty when it can be saved.
export function validatePlan(draft: PlanDraft) {
  const state = payrollStore.getState();
  const errors: string[] = [];
  const existing = state.plans.find((plan) => plan.id === draft.id);

  if (!draft.employeeId) errors.push("Choose an employee.");
  if (!(draft.principal > 0)) errors.push("Enter an amount greater than 0.");
  if (draft.interestRate < 0) errors.push("Interest cannot be negative.");
  if (!(draft.installment > 0)) errors.push("Enter a monthly deduction greater than 0.");
  if (draft.installment > draft.total) {
    errors.push("The monthly deduction cannot be more than the total to recover.");
  }
  if (!draft.startPeriod) errors.push("Choose the first deduction month.");

  const lockedStart = state.runs.find(
    (run) => run.period === draft.startPeriod && run.status !== "Draft",
  );
  if (lockedStart && draft.startPeriod !== existing?.startPeriod) {
    errors.push(
      `The ${formatPeriod(draft.startPeriod)} payroll is already ${lockedStart.status.toLowerCase()}. Start from a later month.`,
    );
  }
  if (existing) {
    const balance = planBalance(existing, state.runs);
    const recovered = balance.recoveredPayroll + balance.pendingPayroll + balance.repaidManually;
    if (draft.total < recovered) {
      errors.push(`The total cannot be less than the ${recovered} already recovered.`);
    }
  }
  return errors;
}

export function savePlan(draft: PlanDraft) {
  const errors = validatePlan(draft);
  if (errors.length > 0) {
    return errors;
  }
  payrollStore.setState((current) => {
    const existing = current.plans.find((plan) => plan.id === draft.id);
    const plan: DeductionPlan = existing
      ? { ...existing, ...draft, id: existing.id }
      : {
          ...draft,
          id: newId(PLAN_ID_PREFIX[draft.kind], current.plans.filter((item) => item.kind === draft.kind)),
          // Recoveries are raised by payroll staff and start straight away.
          status: draft.kind === "Recovery" ? "Active" : "Pending",
          requestedOn: todayIso(),
          approvedBy: "",
          approvedOn: "",
          disbursedOn: "",
          closedOn: "",
          closeReason: "",
          repayments: [],
        };
    return { ...current, plans: upsert(current.plans, plan) };
  });
  return [];
}

export function approvePlan(id: string, approvedBy: string, disbursedOn: string) {
  updatePlan(id, (plan) =>
    plan.status === "Pending"
      ? { ...plan, status: "Active", approvedBy, approvedOn: todayIso(), disbursedOn }
      : plan,
  );
}

export function rejectPlan(id: string, reason: string) {
  updatePlan(id, (plan) =>
    plan.status === "Pending"
      ? { ...plan, status: "Rejected", closedOn: todayIso(), closeReason: reason }
      : plan,
  );
}

export function pausePlan(id: string) {
  updatePlan(id, (plan) => (plan.status === "Active" ? { ...plan, status: "Paused" } : plan));
}

export function resumePlan(id: string) {
  updatePlan(id, (plan) => (plan.status === "Paused" ? { ...plan, status: "Active" } : plan));
}

// Stops further deductions, e.g. a written-off loan or a waived recovery.
export function closePlan(id: string, reason: string) {
  updatePlan(id, (plan) => ({ ...plan, status: "Closed", closedOn: todayIso(), closeReason: reason }));
}

export function addRepayment(id: string, repayment: Omit<ManualRepayment, "id">) {
  const plan = payrollStore.getState().plans.find((item) => item.id === id);
  if (!plan) {
    return "This record no longer exists.";
  }
  const balance = planBalance(plan, payrollStore.getState().runs);
  const open = round2(balance.outstanding - balance.pendingPayroll);
  if (!(repayment.amount > 0)) {
    return "Enter an amount greater than 0.";
  }
  if (repayment.amount > open) {
    return `The amount cannot be more than the ${open} still owed (after deductions already in payroll).`;
  }
  updatePlan(id, (current) => ({
    ...current,
    repayments: [
      ...current.repayments,
      { ...repayment, id: prefixedId("RP-", current.repayments.map((item) => item.id)) },
    ],
  }));
  return "";
}

export function deleteRepayment(id: string, repaymentId: string) {
  updatePlan(id, (plan) => ({
    ...plan,
    repayments: plan.repayments.filter((item) => item.id !== repaymentId),
  }));
}

// Only records nothing has been deducted for can be deleted; others are closed.
export function canDeletePlan(plan: DeductionPlan) {
  return (
    plan.repayments.length === 0 &&
    planRunDeductions(plan, payrollStore.getState().runs).length === 0
  );
}

export function deletePlan(id: string) {
  const plan = payrollStore.getState().plans.find((item) => item.id === id);
  if (!plan || !canDeletePlan(plan)) {
    return false;
  }
  payrollStore.setState((current) => ({
    ...current,
    plans: current.plans.filter((item) => item.id !== id),
  }));
  return true;
}

export function plansOfKind(plans: DeductionPlan[], kind: DeductionPlanKind) {
  return plans.filter((plan) => plan.kind === kind);
}
