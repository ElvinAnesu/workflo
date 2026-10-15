import { round2 } from "./payroll-engine.ts";
import { employeeFullName, formatPeriod, type PayrollEmployee } from "./payroll-run-builder.ts";
import type {
  EmployeePayProfile,
  ExcludedEmployee,
  OvertimeEntry,
  OvertimeLine,
  OvertimeRun,
  OvertimeSettings,
  OvertimeType,
  PayItem,
} from "@/components/payroll/payroll.types";

// Overtime pay: hours × (basic salary ÷ standard monthly hours) × multiplier.
// The standard hours and the multipliers come from Settings.

export function overtimeHourlyRate(basicSalary: number, settings: OvertimeSettings) {
  return settings.standardMonthlyHours > 0 ? basicSalary / settings.standardMonthlyHours : 0;
}

export function overtimeReadiness(types: OvertimeType[], settings: OvertimeSettings) {
  const problems: string[] = [];
  if (!(settings.standardMonthlyHours > 0)) {
    problems.push("Standard working hours per month are not set.");
  }
  if (!types.some((type) => type.active)) {
    problems.push("No active overtime rates are configured.");
  }
  return problems;
}

export type OvertimeLinesInput = {
  entries: OvertimeEntry[];
  employees: PayrollEmployee[];
  profiles: EmployeePayProfile[];
  types: OvertimeType[];
  settings: OvertimeSettings;
};

export function buildOvertimeLines({
  entries,
  employees,
  profiles,
  types,
  settings,
}: OvertimeLinesInput): Pick<OvertimeRun, "lines" | "excluded"> {
  const lines: OvertimeLine[] = [];
  const excluded: ExcludedEmployee[] = [];
  const employeeIds = [...new Set(entries.map((entry) => entry.employeeId))];

  for (const employeeId of employeeIds) {
    const employee = employees.find((item) => item.id === employeeId);
    const employeeName = employee ? employeeFullName(employee) : employeeId;
    const profile = profiles.find((item) => item.employeeId === employeeId);

    if (!profile || !(profile.basicSalary > 0)) {
      excluded.push({
        employeeId,
        employeeName,
        reason: "No basic salary set in Component assignment",
      });
      continue;
    }

    const hourlyRate = overtimeHourlyRate(profile.basicSalary, settings);
    const items = types
      .map((type) => {
        const hours = round2(
          entries
            .filter((entry) => entry.employeeId === employeeId && entry.typeId === type.id)
            .reduce((sum, entry) => sum + entry.hours, 0),
        );
        return {
          typeId: type.id,
          code: type.code,
          name: type.name,
          multiplier: type.multiplier,
          taxable: type.taxable,
          hours,
          amount: round2(hours * hourlyRate * type.multiplier),
        };
      })
      .filter((item) => item.hours > 0);

    lines.push({
      employeeId,
      employeeName,
      department: employee?.department ?? "",
      basicSalary: profile.basicSalary,
      hourlyRate: round2(hourlyRate),
      items,
      hours: round2(items.reduce((sum, item) => sum + item.hours, 0)),
      amount: round2(items.reduce((sum, item) => sum + item.amount, 0)),
    });
  }

  return {
    lines: lines.sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    excluded,
  };
}

// Earnings from locked overtime runs that are paid in the `period` payroll.
export function overtimeEarningsForPeriod(runs: OvertimeRun[], period: string) {
  const result = new Map<string, PayItem[]>();
  for (const run of runs) {
    if (run.status !== "Locked" || run.payPeriod !== period) {
      continue;
    }
    for (const line of run.lines) {
      const items = line.items.map((item) => ({
        componentId: `${run.id}:${item.typeId}`,
        code: item.code,
        name: `Overtime ${formatPeriod(run.period)} · ${item.name}`,
        amount: item.amount,
        taxable: item.taxable,
      }));
      result.set(line.employeeId, [...(result.get(line.employeeId) ?? []), ...items]);
    }
  }
  return result;
}

export function overtimeRunTotals(run: Pick<OvertimeRun, "lines">) {
  return {
    employees: run.lines.length,
    hours: round2(run.lines.reduce((sum, line) => sum + line.hours, 0)),
    amount: round2(run.lines.reduce((sum, line) => sum + line.amount, 0)),
  };
}
