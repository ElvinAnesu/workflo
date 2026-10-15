import { planDeductionsForPeriod } from "./deduction-plans.ts";
import { midMonthDeductionsForPeriod } from "./mid-month.ts";
import { overtimeEarningsForPeriod } from "./overtime.ts";
import type {
  DeductionPlan,
  MidMonthRun,
  OvertimeRun,
  PayItem,
  PayrollRun,
} from "@/components/payroll/payroll.types";

// Everything a monthly payroll picks up besides the pay profile: overtime
// from locked overtime runs, the locked mid-month payment, and loan, advance
// and recovery installments.

export type PeriodAdjustments = Map<string, { earnings: PayItem[]; deductions: PayItem[] }>;

export type PeriodAdjustmentsInput = {
  period: string;
  plans: DeductionPlan[];
  runs: PayrollRun[];
  midMonthRuns: MidMonthRun[];
  overtimeRuns: OvertimeRun[];
  // The monthly run being calculated, if it already exists.
  excludeRunId?: string;
  includeMidMonth?: boolean;
};

export function periodAdjustments({
  period,
  plans,
  runs,
  midMonthRuns,
  overtimeRuns,
  excludeRunId,
  includeMidMonth = true,
}: PeriodAdjustmentsInput): PeriodAdjustments {
  const result: PeriodAdjustments = new Map();
  const entry = (employeeId: string) => {
    const existing = result.get(employeeId) ?? { earnings: [], deductions: [] };
    result.set(employeeId, existing);
    return existing;
  };

  for (const [employeeId, items] of overtimeEarningsForPeriod(overtimeRuns, period)) {
    entry(employeeId).earnings.push(...items);
  }
  if (includeMidMonth) {
    for (const [employeeId, items] of midMonthDeductionsForPeriod(midMonthRuns, period)) {
      entry(employeeId).deductions.push(...items);
    }
  }
  for (const [employeeId, items] of planDeductionsForPeriod(plans, period, runs, excludeRunId)) {
    entry(employeeId).deductions.push(...items);
  }

  return result;
}

export type InputKind = "Overtime" | "Mid-month" | "Loan" | "Advance" | "Recovery";

// Classifies a pay item that came from period inputs; null for components.
export function inputKind(item: PayItem): InputKind | null {
  if (item.componentId.startsWith("OT-")) return "Overtime";
  if (item.componentId.startsWith("MM-")) return "Mid-month";
  if (item.componentId.startsWith("LN-")) return "Loan";
  if (item.componentId.startsWith("ADV-")) return "Advance";
  if (item.componentId.startsWith("REC-")) return "Recovery";
  return null;
}
