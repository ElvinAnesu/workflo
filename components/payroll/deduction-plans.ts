import { round2 } from "./payroll-engine.ts";
import type {
  DeductionPlan,
  DeductionPlanKind,
  PayItem,
  PayrollRun,
  PayrollRunStatus,
} from "@/components/payroll/payroll.types";

// Pure rules for loans, salary advances and payment recoveries: how much is
// deducted in a payroll month, what is still owed, and the repayment
// schedule. Monthly payroll runs are the record of what was deducted.

export const PLAN_ID_PREFIX: Record<DeductionPlanKind, string> = {
  Loan: "LN-",
  Advance: "ADV-",
  Recovery: "REC-",
};

const PLAN_CODE: Record<DeductionPlanKind, string> = {
  Loan: "LOAN",
  Advance: "ADVANCE",
  Recovery: "RECOVERY",
};

export function addMonths(period: string, months: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

export function loanTotal(principal: number, interestRate: number) {
  return round2(principal * (1 + (interestRate || 0) / 100));
}

// Smallest installment, to the cent, that clears the total in `months`.
export function installmentFor(total: number, months: number) {
  if (!(months > 0) || !(total > 0)) {
    return 0;
  }
  return Math.ceil((total / months) * 100) / 100;
}

export function monthsToRepay(total: number, installment: number) {
  if (!(installment > 0) || !(total > 0)) {
    return 0;
  }
  return Math.ceil(round2(total / installment) - 1e-9);
}

export function planDeductionItem(plan: DeductionPlan, amount: number): PayItem {
  const label =
    plan.kind === "Loan"
      ? "Loan repayment"
      : plan.kind === "Advance"
        ? "Salary advance recovery"
        : plan.category || "Payment recovery";
  return {
    componentId: plan.id,
    code: PLAN_CODE[plan.kind],
    name: `${label} (${plan.id})`,
    amount,
    taxable: false,
  };
}

export type PlanRunDeduction = {
  runId: string;
  period: string;
  status: PayrollRunStatus;
  amount: number;
};

export function planRunDeductions(plan: DeductionPlan, runs: PayrollRun[]) {
  const result: PlanRunDeduction[] = [];
  for (const run of runs) {
    const line = run.lines.find((item) => item.employeeId === plan.employeeId);
    const item = line?.deductions.find((deduction) => deduction.componentId === plan.id);
    if (item) {
      result.push({ runId: run.id, period: run.period, status: run.status, amount: item.amount });
    }
  }
  return result.sort((a, b) => a.period.localeCompare(b.period));
}

export type PlanBalance = {
  total: number;
  // Deducted in locked payrolls.
  recoveredPayroll: number;
  // Deducted in payrolls that are still draft or approved.
  pendingPayroll: number;
  repaidManually: number;
  // Total minus locked payroll deductions and manual repayments.
  outstanding: number;
};

export function planBalance(plan: DeductionPlan, runs: PayrollRun[]): PlanBalance {
  const deductions = planRunDeductions(plan, runs);
  const recoveredPayroll = round2(
    deductions
      .filter((item) => item.status === "Locked")
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const pendingPayroll = round2(
    deductions
      .filter((item) => item.status !== "Locked")
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const repaidManually = round2(plan.repayments.reduce((sum, item) => sum + item.amount, 0));
  return {
    total: plan.total,
    recoveredPayroll,
    pendingPayroll,
    repaidManually,
    outstanding: round2(Math.max(0, plan.total - recoveredPayroll - repaidManually)),
  };
}

// What a payroll for `period` should deduct. `excludeRunId` is the run being
// calculated, so its own earlier figures are not counted twice.
export function planInstallmentForPeriod(
  plan: DeductionPlan,
  period: string,
  runs: PayrollRun[],
  excludeRunId?: string,
) {
  if (plan.status !== "Active" || period < plan.startPeriod) {
    return 0;
  }
  const deductedElsewhere = planRunDeductions(
    plan,
    runs.filter((run) => run.id !== excludeRunId),
  ).reduce((sum, item) => sum + item.amount, 0);
  const repaid = plan.repayments.reduce((sum, item) => sum + item.amount, 0);
  const remaining = round2(plan.total - deductedElsewhere - repaid);
  return remaining > 0 ? round2(Math.min(plan.installment, remaining)) : 0;
}

export type PlanDisplayStatus = DeductionPlan["status"] | "Completed";

export function planDisplayStatus(plan: DeductionPlan, runs: PayrollRun[]): PlanDisplayStatus {
  if (plan.status === "Active" && planBalance(plan, runs).outstanding <= 0) {
    return "Completed";
  }
  return plan.status;
}

export type ScheduleRow = {
  period: string;
  amount: number;
  // Locked, Approved or Draft for months already in a payroll, Projected otherwise.
  source: PayrollRunStatus | "Projected";
  balanceAfter: number;
};

// Months already in a payroll, followed by the projected months until the
// balance is cleared. Projection starts after the latest payroll month.
export function planSchedule(plan: DeductionPlan, runs: PayrollRun[]): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = round2(plan.total - plan.repayments.reduce((sum, item) => sum + item.amount, 0));

  for (const item of planRunDeductions(plan, runs)) {
    balance = round2(balance - item.amount);
    rows.push({ period: item.period, amount: item.amount, source: item.status, balanceAfter: balance });
  }

  if (plan.status !== "Active" && plan.status !== "Pending" && plan.status !== "Paused") {
    return rows;
  }

  const latestRun = runs.reduce((latest, run) => (run.period > latest ? run.period : latest), "");
  let period = plan.startPeriod;
  if (latestRun && period <= latestRun) {
    period = addMonths(latestRun, 1);
  }

  for (let guard = 0; balance > 0 && plan.installment > 0 && guard < 600; guard += 1) {
    const amount = round2(Math.min(plan.installment, balance));
    balance = round2(balance - amount);
    rows.push({ period, amount, source: "Projected", balanceAfter: balance });
    period = addMonths(period, 1);
  }

  return rows;
}

// Plan deductions for every employee in a payroll month.
export function planDeductionsForPeriod(
  plans: DeductionPlan[],
  period: string,
  runs: PayrollRun[],
  excludeRunId?: string,
) {
  const result = new Map<string, PayItem[]>();
  for (const plan of plans) {
    const amount = planInstallmentForPeriod(plan, period, runs, excludeRunId);
    if (amount > 0) {
      result.set(plan.employeeId, [
        ...(result.get(plan.employeeId) ?? []),
        planDeductionItem(plan, amount),
      ]);
    }
  }
  return result;
}
