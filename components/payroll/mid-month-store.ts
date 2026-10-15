"use client";

import type { EmployeeRecord } from "@/components/employees/employee.types";
import { buildMidMonthLines, midMonthWarnings } from "@/components/payroll/mid-month";
import { periodAdjustments } from "@/components/payroll/payroll-inputs";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import {
  payrollReadiness,
  payrollSettings,
  payrollStore,
  type PayrollState,
} from "@/components/payroll/payroll-store";
import type { MidMonthBasis, MidMonthRun } from "@/components/payroll/payroll.types";
import { todayIso } from "@/components/store/persistent-store";

export type MidMonthSetup = {
  basis: MidMonthBasis;
  value: number;
  paymentDate: string;
};

function validateSetup(setup: MidMonthSetup) {
  if (!(setup.value > 0)) {
    return setup.basis === "Fixed amount"
      ? "Enter the amount to pay each employee."
      : "Enter the percentage of basic salary to pay.";
  }
  if (setup.basis === "% of basic salary" && setup.value > 100) {
    return "The percentage cannot be more than 100.";
  }
  return "";
}

// A mid-month run is deducted in its month's payroll, so that payroll must
// still be a draft for the deduction to be picked up.
function monthlyBlock(state: PayrollState, period: string) {
  const monthly = state.runs.find((run) => run.period === period);
  return monthly && monthly.status !== "Draft"
    ? `The ${formatPeriod(period)} monthly payroll is already ${monthly.status.toLowerCase()}, so this payment could not be deducted from it.`
    : "";
}

function compute(run: MidMonthRun, state: PayrollState, employees: EmployeeRecord[]): MidMonthRun {
  const overrides = new Map(
    run.lines.filter((line) => line.overridden).map((line) => [line.employeeId, line.amount]),
  );
  return {
    ...run,
    ...buildMidMonthLines({
      period: run.period,
      basis: run.basis,
      value: run.value,
      employees,
      profiles: state.profiles,
      holds: state.holds,
      banks: state.banks,
      settings: payrollSettings(state),
      adjustments: periodAdjustments({
        period: run.period,
        plans: state.plans,
        runs: state.runs,
        midMonthRuns: state.midMonthRuns,
        overtimeRuns: state.overtimeRuns,
        excludeRunId: `PR-${run.period}`,
        includeMidMonth: false,
      }),
      overrides,
    }),
    calculatedOn: new Date().toISOString(),
  };
}

function replaceRun(next: MidMonthRun) {
  payrollStore.setState((current) => ({
    ...current,
    midMonthRuns: current.midMonthRuns.map((run) => (run.id === next.id ? next : run)),
  }));
}

function findDraft(id: string) {
  const run = payrollStore.getState().midMonthRuns.find((item) => item.id === id);
  return run && run.status === "Draft" ? run : null;
}

export function createMidMonthRun(
  period: string,
  setup: MidMonthSetup,
  employees: EmployeeRecord[],
) {
  const state = payrollStore.getState();
  const problem =
    payrollReadiness(state)[0] ||
    (state.midMonthRuns.some((run) => run.period === period)
      ? "A mid-month payroll for this month already exists."
      : "") ||
    validateSetup(setup) ||
    monthlyBlock(state, period);
  if (problem) {
    return { error: problem };
  }

  const run = compute(
    {
      id: `MM-${period}`,
      period,
      status: "Draft",
      ...setup,
      createdOn: todayIso(),
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
      lines: [],
      excluded: [],
    },
    state,
    employees,
  );
  payrollStore.setState((current) => ({
    ...current,
    midMonthRuns: [run, ...current.midMonthRuns],
  }));
  return { run };
}

// Recalculates with the latest data; `setup` changes the basis, discarding
// amounts typed in by hand.
export function recalculateMidMonthRun(
  id: string,
  employees: EmployeeRecord[],
  setup?: MidMonthSetup,
) {
  const run = findDraft(id);
  if (!run) {
    return { error: "Only draft payrolls can be recalculated." };
  }
  const state = payrollStore.getState();
  const problem = payrollReadiness(state)[0] || (setup ? validateSetup(setup) : "");
  if (problem) {
    return { error: problem };
  }
  const base = setup
    ? {
        ...run,
        ...setup,
        lines: run.lines.map((line) => ({ ...line, overridden: false })),
      }
    : run;
  const next = compute(base, state, employees);
  replaceRun(next);
  return { run: next };
}

// Sets one employee's amount by hand; null goes back to the default.
export function setMidMonthAmount(id: string, employeeId: string, amount: number | null) {
  const run = findDraft(id);
  if (!run) {
    return;
  }
  replaceRun({
    ...run,
    lines: run.lines.map((line) => {
      if (line.employeeId !== employeeId) {
        return line;
      }
      const next = amount === null ? line.defaultAmount : Math.max(0, amount);
      return {
        ...line,
        amount: next,
        overridden: amount !== null,
        warnings: midMonthWarnings(
          next,
          line.estimatedNet,
          Boolean(line.bankName && line.accountNumber.trim()),
        ),
      };
    }),
  });
}

export function approveMidMonthRun(id: string, approvedBy: string) {
  const run = findDraft(id);
  if (run) {
    replaceRun({ ...run, status: "Approved", approvedBy, approvedOn: todayIso() });
  }
}

export function reopenMidMonthRun(id: string) {
  const run = payrollStore.getState().midMonthRuns.find((item) => item.id === id);
  if (run?.status === "Approved") {
    replaceRun({ ...run, status: "Draft", approvedBy: "", approvedOn: "" });
  }
}

export function lockMidMonthRun(id: string) {
  const state = payrollStore.getState();
  const run = state.midMonthRuns.find((item) => item.id === id);
  if (run?.status !== "Approved") {
    return "Only approved payrolls can be locked.";
  }
  const problem = monthlyBlock(state, run.period);
  if (problem) {
    return `${problem} Move it back to draft first.`;
  }
  replaceRun({ ...run, status: "Locked", lockedOn: todayIso() });
  return "";
}

export function deleteMidMonthRun(id: string) {
  payrollStore.setState((current) => ({
    ...current,
    midMonthRuns: current.midMonthRuns.filter(
      (run) => !(run.id === id && run.status === "Draft"),
    ),
  }));
}
