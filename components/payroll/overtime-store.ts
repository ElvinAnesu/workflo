"use client";

import type { EmployeeRecord } from "@/components/employees/employee.types";
import { buildOvertimeLines, overtimeReadiness } from "@/components/payroll/overtime";
import { formatPeriod } from "@/components/payroll/payroll-run-builder";
import {
  newId,
  payrollStore,
  upsert,
  type PayrollState,
} from "@/components/payroll/payroll-store";
import type {
  OvertimeEntry,
  OvertimeRun,
  OvertimeType,
} from "@/components/payroll/payroll.types";
import { prefixedId, todayIso } from "@/components/store/persistent-store";

// Settings ----------------------------------------------------------------------

export function saveOvertimeType(type: Omit<OvertimeType, "id"> & { id?: string }) {
  payrollStore.setState((current) => ({
    ...current,
    overtimeTypes: upsert(current.overtimeTypes, {
      ...type,
      id: type.id || newId("OTT-", current.overtimeTypes),
    }),
  }));
}

export function overtimeTypeInUse(state: PayrollState, typeId: string) {
  return state.overtimeRuns.some((run) => run.entries.some((entry) => entry.typeId === typeId));
}

export function deleteOvertimeType(id: string) {
  if (overtimeTypeInUse(payrollStore.getState(), id)) {
    return false;
  }
  payrollStore.setState((current) => ({
    ...current,
    overtimeTypes: current.overtimeTypes.filter((type) => type.id !== id),
  }));
  return true;
}

export function saveStandardMonthlyHours(hours: number) {
  payrollStore.setState((current) => ({
    ...current,
    overtimeSettings: { ...current.overtimeSettings, standardMonthlyHours: hours },
  }));
}

// Runs ----------------------------------------------------------------------------

// Overtime is paid in a monthly payroll, which must still be a draft.
function monthlyBlock(state: PayrollState, payPeriod: string) {
  const monthly = state.runs.find((run) => run.period === payPeriod);
  return monthly && monthly.status !== "Draft"
    ? `The ${formatPeriod(payPeriod)} monthly payroll is already ${monthly.status.toLowerCase()}, so this overtime could not be paid in it.`
    : "";
}

function compute(run: OvertimeRun, state: PayrollState, employees: EmployeeRecord[]): OvertimeRun {
  return {
    ...run,
    ...buildOvertimeLines({
      entries: run.entries,
      employees,
      profiles: state.profiles,
      types: state.overtimeTypes,
      settings: state.overtimeSettings,
    }),
    calculatedOn: new Date().toISOString(),
  };
}

function replaceRun(next: OvertimeRun) {
  payrollStore.setState((current) => ({
    ...current,
    overtimeRuns: current.overtimeRuns.map((run) => (run.id === next.id ? next : run)),
  }));
}

function findDraft(id: string) {
  const run = payrollStore.getState().overtimeRuns.find((item) => item.id === id);
  return run && run.status === "Draft" ? run : null;
}

export function createOvertimeRun(period: string, payPeriod: string) {
  const state = payrollStore.getState();
  const problem =
    overtimeReadiness(state.overtimeTypes, state.overtimeSettings)[0] ||
    (state.overtimeRuns.some((run) => run.period === period)
      ? "An overtime sheet for this month already exists."
      : "") ||
    (payPeriod < period ? "Overtime cannot be paid before the month it was worked." : "") ||
    monthlyBlock(state, payPeriod);
  if (problem) {
    return { error: problem };
  }
  const run: OvertimeRun = {
    id: `OT-${period}`,
    period,
    payPeriod,
    status: "Draft",
    entries: [],
    lines: [],
    excluded: [],
    createdOn: todayIso(),
    calculatedOn: "",
    approvedBy: "",
    approvedOn: "",
    lockedOn: "",
  };
  payrollStore.setState((current) => ({
    ...current,
    overtimeRuns: [run, ...current.overtimeRuns],
  }));
  return { run };
}

export function setOvertimePayPeriod(id: string, payPeriod: string) {
  const run = findDraft(id);
  if (!run) {
    return "Only draft overtime sheets can be changed.";
  }
  const problem =
    (payPeriod < run.period ? "Overtime cannot be paid before the month it was worked." : "") ||
    monthlyBlock(payrollStore.getState(), payPeriod);
  if (problem) {
    return problem;
  }
  replaceRun({ ...run, payPeriod });
  return "";
}

export function validateOvertimeEntry(run: OvertimeRun, entry: Omit<OvertimeEntry, "id">) {
  const state = payrollStore.getState();
  if (!entry.employeeId) return "Choose an employee.";
  if (!state.overtimeTypes.some((type) => type.id === entry.typeId)) {
    return "Choose an overtime rate.";
  }
  if (!entry.date.startsWith(`${run.period}-`)) {
    return `The date must be in ${formatPeriod(run.period)}.`;
  }
  if (!(entry.hours > 0) || entry.hours > 24) {
    return "Hours must be more than 0 and no more than 24.";
  }
  return "";
}

export function saveOvertimeEntries(
  id: string,
  entries: (Omit<OvertimeEntry, "id"> & { id?: string })[],
  employees: EmployeeRecord[],
) {
  const run = findDraft(id);
  if (!run) {
    return "Only draft overtime sheets can be changed.";
  }
  let next = run.entries;
  for (const entry of entries) {
    next = upsert(next, {
      ...entry,
      id: entry.id || prefixedId("E-", next.map((item) => item.id), 4),
    });
  }
  replaceRun(compute({ ...run, entries: next }, payrollStore.getState(), employees));
  return "";
}

export function deleteOvertimeEntry(id: string, entryId: string, employees: EmployeeRecord[]) {
  const run = findDraft(id);
  if (run) {
    replaceRun(
      compute(
        { ...run, entries: run.entries.filter((entry) => entry.id !== entryId) },
        payrollStore.getState(),
        employees,
      ),
    );
  }
}

export function recalculateOvertimeRun(id: string, employees: EmployeeRecord[]) {
  const run = findDraft(id);
  if (!run) {
    return "Only draft overtime sheets can be recalculated.";
  }
  const state = payrollStore.getState();
  const problem = overtimeReadiness(state.overtimeTypes, state.overtimeSettings)[0];
  if (problem) {
    return problem;
  }
  replaceRun(compute(run, state, employees));
  return "";
}

export function approveOvertimeRun(id: string, approvedBy: string) {
  const run = findDraft(id);
  if (run) {
    replaceRun({ ...run, status: "Approved", approvedBy, approvedOn: todayIso() });
  }
}

export function reopenOvertimeRun(id: string) {
  const run = payrollStore.getState().overtimeRuns.find((item) => item.id === id);
  if (run?.status === "Approved") {
    replaceRun({ ...run, status: "Draft", approvedBy: "", approvedOn: "" });
  }
}

export function lockOvertimeRun(id: string) {
  const state = payrollStore.getState();
  const run = state.overtimeRuns.find((item) => item.id === id);
  if (run?.status !== "Approved") {
    return "Only approved overtime sheets can be locked.";
  }
  const problem = monthlyBlock(state, run.payPeriod);
  if (problem) {
    return `${problem} Move it back to draft or pay the overtime in a later month.`;
  }
  replaceRun({ ...run, status: "Locked", lockedOn: todayIso() });
  return "";
}

export function deleteOvertimeRun(id: string) {
  payrollStore.setState((current) => ({
    ...current,
    overtimeRuns: current.overtimeRuns.filter(
      (run) => !(run.id === id && run.status === "Draft"),
    ),
  }));
}
