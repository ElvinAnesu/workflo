"use client";

import { validateTaxBands } from "@/components/payroll/payroll-engine";
import { periodAdjustments } from "@/components/payroll/payroll-inputs";
import { buildPayrollRunLines, formatPeriod } from "@/components/payroll/payroll-run-builder";
import type {
  Bank,
  DeductionPlan,
  EmployeePayProfile,
  MidMonthRun,
  OvertimeRun,
  OvertimeSettings,
  OvertimeType,
  PayComponent,
  PayrollRun,
  PayrollSettings,
  SalaryHold,
  StatutoryContribution,
  TaxBand,
} from "@/components/payroll/payroll.types";
import type { EmployeeRecord } from "@/components/employees/employee.types";
import {
  createPersistentStore,
  prefixedId,
  todayIso,
} from "@/components/store/persistent-store";

export type PayrollState = {
  components: PayComponent[];
  contributions: StatutoryContribution[];
  taxBands: TaxBand[];
  banks: Bank[];
  profiles: EmployeePayProfile[];
  holds: SalaryHold[];
  runs: PayrollRun[];
  plans: DeductionPlan[];
  midMonthRuns: MidMonthRun[];
  overtimeTypes: OvertimeType[];
  overtimeSettings: OvertimeSettings;
  overtimeRuns: OvertimeRun[];
};

// Ships empty: every rate, band and component is configured by the company.
export const payrollStore = createPersistentStore<PayrollState>("workflo.payroll.v1", {
  components: [],
  contributions: [],
  taxBands: [],
  banks: [],
  profiles: [],
  holds: [],
  runs: [],
  plans: [],
  midMonthRuns: [],
  overtimeTypes: [],
  overtimeSettings: { standardMonthlyHours: 0 },
  overtimeRuns: [],
});
const store = payrollStore;

export const usePayrollState = store.useStore;

export function payrollSettings(state: PayrollState): PayrollSettings {
  return {
    components: state.components,
    contributions: state.contributions,
    taxBands: state.taxBands,
  };
}

export function upsert<T extends { id: string }>(items: T[], item: T) {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

export function newId(prefix: string, items: { id: string }[]) {
  return prefixedId(prefix, items.map((item) => item.id), 4);
}

// Settings ------------------------------------------------------------------

export function savePayComponent(component: Omit<PayComponent, "id"> & { id?: string }) {
  store.setState((current) => ({
    ...current,
    components: upsert(current.components, {
      ...component,
      id: component.id || newId("PC-", current.components),
    }),
  }));
}

export function deletePayComponent(id: string) {
  store.setState((current) => ({
    ...current,
    components: current.components.filter((item) => item.id !== id),
    profiles: current.profiles.map((profile) => ({
      ...profile,
      components: profile.components.filter((item) => item.componentId !== id),
    })),
  }));
}

export function saveContribution(
  contribution: Omit<StatutoryContribution, "id"> & { id?: string },
) {
  store.setState((current) => ({
    ...current,
    contributions: upsert(current.contributions, {
      ...contribution,
      id: contribution.id || newId("SC-", current.contributions),
    }),
  }));
}

export function deleteContribution(id: string) {
  store.setState((current) => ({
    ...current,
    contributions: current.contributions.filter((item) => item.id !== id),
    profiles: current.profiles.map((profile) => ({
      ...profile,
      contributionIds: profile.contributionIds.filter((item) => item !== id),
    })),
  }));
}

// Replaces the whole band table; callers validate first.
export function saveTaxBands(bands: Omit<TaxBand, "id">[]) {
  const errors = validateTaxBands(bands.map((band, index) => ({ ...band, id: String(index) })));
  if (errors.length > 0) {
    return errors;
  }
  store.setState((current) => ({
    ...current,
    taxBands: [...bands]
      .sort((a, b) => a.from - b.from)
      .map((band, index) => ({ ...band, id: `TB-${index + 1}` })),
  }));
  return [];
}

export function saveBank(bank: Omit<Bank, "id"> & { id?: string }) {
  store.setState((current) => ({
    ...current,
    banks: upsert(current.banks, {
      ...bank,
      id: bank.id || newId("BK-", current.banks),
    }),
  }));
}

export function deleteBank(id: string) {
  store.setState((current) => ({
    ...current,
    banks: current.banks.filter((item) => item.id !== id),
    profiles: current.profiles.map((profile) =>
      profile.bankId === id ? { ...profile, bankId: "" } : profile,
    ),
  }));
}

export function addBanks(banks: Omit<Bank, "id">[]) {
  store.setState((current) => {
    let next = current.banks;
    for (const bank of banks) {
      next = [...next, { ...bank, id: newId("BK-", next) }];
    }
    return { ...current, banks: next };
  });
  return store.getState().banks;
}

// Employee pay profiles -------------------------------------------------------

export function emptyProfile(employeeId: string): EmployeePayProfile {
  return {
    employeeId,
    basicSalary: 0,
    components: [],
    bankId: "",
    accountNumber: "",
    contributionIds: [],
  };
}

export function saveProfile(profile: EmployeePayProfile) {
  store.setState((current) => ({
    ...current,
    profiles: current.profiles.some((item) => item.employeeId === profile.employeeId)
      ? current.profiles.map((item) =>
          item.employeeId === profile.employeeId ? profile : item,
        )
      : [...current.profiles, profile],
  }));
}

export function addProfiles(profiles: EmployeePayProfile[]) {
  store.setState((current) => ({
    ...current,
    profiles: [
      ...current.profiles.filter(
        (item) => !profiles.some((p) => p.employeeId === item.employeeId),
      ),
      ...profiles,
    ],
  }));
}

// Salary holds ------------------------------------------------------------------

export function saveHold(hold: Omit<SalaryHold, "id" | "createdOn" | "releasedOn"> & { id?: string }) {
  store.setState((current) => {
    const existing = current.holds.find((item) => item.id === hold.id);
    return {
      ...current,
      holds: upsert(current.holds, {
        ...hold,
        id: hold.id || newId("HLD-", current.holds),
        createdOn: existing?.createdOn ?? todayIso(),
        releasedOn: existing?.releasedOn ?? "",
      }),
    };
  });
}

export function releaseHold(id: string) {
  store.setState((current) => ({
    ...current,
    holds: current.holds.map((item) =>
      item.id === id ? { ...item, releasedOn: todayIso() } : item,
    ),
  }));
}

// Payroll runs --------------------------------------------------------------------

export function payrollReadiness(state: PayrollState) {
  return validateTaxBands(state.taxBands).length > 0
    ? ["PAYE tax bands are not configured. Set them up in Settings → Tax bands before running payroll."]
    : [];
}

function computeRun(
  run: PayrollRun,
  state: PayrollState,
  employees: EmployeeRecord[],
): PayrollRun {
  return {
    ...run,
    ...buildPayrollRunLines({
      period: run.period,
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
        excludeRunId: run.id,
      }),
    }),
    calculatedOn: new Date().toISOString(),
  };
}

export function createPayrollRun(period: string, employees: EmployeeRecord[]) {
  const state = store.getState();

  if (payrollReadiness(state).length > 0) {
    return { error: payrollReadiness(state)[0] };
  }
  if (state.runs.some((run) => run.period === period)) {
    return { error: "A payroll for this month already exists." };
  }

  const run = computeRun(
    {
      id: `PR-${period}`,
      period,
      status: "Draft",
      createdOn: todayIso(),
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
      contributionColumns: [],
      lines: [],
      excluded: [],
    },
    state,
    employees,
  );

  store.setState((current) => ({ ...current, runs: [run, ...current.runs] }));
  return { run };
}

export function recalculatePayrollRun(id: string, employees: EmployeeRecord[]) {
  const state = store.getState();
  const run = state.runs.find((item) => item.id === id);

  if (!run || run.status !== "Draft") {
    return { error: "Only draft payrolls can be recalculated." };
  }
  if (payrollReadiness(state).length > 0) {
    return { error: payrollReadiness(state)[0] };
  }

  const next = computeRun(run, state, employees);
  store.setState((current) => ({
    ...current,
    runs: current.runs.map((item) => (item.id === id ? next : item)),
  }));
  return { run: next };
}

export function approvePayrollRun(id: string, approvedBy: string) {
  store.setState((current) => ({
    ...current,
    runs: current.runs.map((run) =>
      run.id === id && run.status === "Draft"
        ? { ...run, status: "Approved", approvedBy, approvedOn: todayIso() }
        : run,
    ),
  }));
}

export function reopenPayrollRun(id: string) {
  store.setState((current) => ({
    ...current,
    runs: current.runs.map((run) =>
      run.id === id && run.status === "Approved"
        ? { ...run, status: "Draft", approvedBy: "", approvedOn: "" }
        : run,
    ),
  }));
}

export function lockPayrollRun(id: string) {
  store.setState((current) => ({
    ...current,
    runs: current.runs.map((run) =>
      run.id === id && run.status === "Approved"
        ? { ...run, status: "Locked", lockedOn: todayIso() }
        : run,
    ),
  }));
}

export function deletePayrollRun(id: string) {
  store.setState((current) => ({
    ...current,
    runs: current.runs.filter((run) => !(run.id === id && run.status === "Draft")),
  }));
}

// Inputs for a month that are not yet final, so the monthly payroll does not
// include them.
export function monthlyInputNotices(state: PayrollState, period: string) {
  const notices: { text: string; href: string }[] = [];
  for (const run of state.midMonthRuns) {
    if (run.period === period && run.status !== "Locked") {
      notices.push({
        text: `The mid-month payroll is ${run.status.toLowerCase()}. Its payments are deducted here only once it is locked.`,
        href: `/payroll/mid-month/${run.id}`,
      });
    }
  }
  for (const run of state.overtimeRuns) {
    if (run.payPeriod === period && run.status !== "Locked") {
      notices.push({
        text: `The ${formatPeriod(run.period)} overtime sheet is ${run.status.toLowerCase()}. Its overtime is paid here only once it is locked.`,
        href: `/payroll/overtime/${run.id}`,
      });
    }
  }
  return notices;
}
