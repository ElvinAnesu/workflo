import { calculateEmployeePay, round2 } from "./payroll-engine.ts";
import { formatMoney } from "./payroll-format.ts";
import {
  employeeFullName,
  isHoldActive,
  type PayrollEmployee,
} from "./payroll-run-builder.ts";
import type { PeriodAdjustments } from "./payroll-inputs.ts";
import type {
  Bank,
  EmployeePayProfile,
  ExcludedEmployee,
  MidMonthBasis,
  MidMonthLine,
  MidMonthRun,
  PayItem,
  PayrollSettings,
  SalaryHold,
} from "@/components/payroll/payroll.types";

// Mid-month payroll pays part of the month's salary early. Once the run is
// locked, each amount is deducted from the same month's monthly payroll.

export type MidMonthLinesInput = {
  period: string;
  basis: MidMonthBasis;
  value: number;
  employees: PayrollEmployee[];
  profiles: EmployeePayProfile[];
  holds: SalaryHold[];
  banks: Bank[];
  settings: PayrollSettings;
  // Overtime and plan deductions for the month, without mid-month pay.
  adjustments: PeriodAdjustments;
  // Amounts typed in by hand on an earlier calculation, kept on recalculation.
  overrides: Map<string, number>;
};

export function basisLabel(basis: MidMonthBasis, value: number) {
  return basis === "% of basic salary" ? `${value}% of basic salary` : `${formatMoney(value)} each`;
}

export function midMonthDefaultAmount(basis: MidMonthBasis, value: number, basicSalary: number) {
  return round2(basis === "% of basic salary" ? (basicSalary * value) / 100 : value);
}

export function midMonthWarnings(amount: number, estimatedNet: number, hasBank: boolean) {
  const warnings: string[] = [];
  if (amount > estimatedNet) {
    warnings.push("More than the estimated net pay for the month");
  }
  if (amount > 0 && !hasBank) {
    warnings.push("Missing bank or account number");
  }
  return warnings;
}

export function buildMidMonthLines({
  period,
  basis,
  value,
  employees,
  profiles,
  holds,
  banks,
  settings,
  adjustments,
  overrides,
}: MidMonthLinesInput): Pick<MidMonthRun, "lines" | "excluded"> {
  const lines: MidMonthLine[] = [];
  const excluded: ExcludedEmployee[] = [];

  for (const employee of employees) {
    if (employee.status !== "Active") {
      continue;
    }
    const employeeName = employeeFullName(employee);
    const profile = profiles.find((item) => item.employeeId === employee.id);

    if (!profile || !(profile.basicSalary > 0)) {
      excluded.push({
        employeeId: employee.id,
        employeeName,
        reason: "No basic salary set in Component assignment",
      });
      continue;
    }
    const hold = holds.find(
      (item) => item.employeeId === employee.id && isHoldActive(item, period),
    );
    if (hold) {
      excluded.push({
        employeeId: employee.id,
        employeeName,
        reason: `Salary on hold${hold.reason ? ` (${hold.reason})` : ""}`,
      });
      continue;
    }

    const extras = adjustments.get(employee.id);
    const estimatedNet = calculateEmployeePay(
      {
        ...profile,
        extraEarnings: extras?.earnings,
        extraDeductions: extras?.deductions,
      },
      settings,
    ).netPay;
    const defaultAmount = midMonthDefaultAmount(basis, value, profile.basicSalary);
    const overridden = overrides.has(employee.id);
    const amount = overridden ? overrides.get(employee.id)! : defaultAmount;
    const bank = banks.find((item) => item.id === profile.bankId);
    const hasBank = Boolean(bank && profile.accountNumber.trim());

    lines.push({
      employeeId: employee.id,
      employeeName,
      department: employee.department,
      designation: employee.designation,
      basicSalary: profile.basicSalary,
      estimatedNet,
      defaultAmount,
      amount,
      overridden,
      bankName: bank?.name ?? "",
      accountNumber: profile.accountNumber,
      warnings: midMonthWarnings(amount, estimatedNet, hasBank),
    });
  }

  return { lines, excluded };
}

// Mid-month payments to take back in the `period` monthly payroll.
export function midMonthDeductionsForPeriod(runs: MidMonthRun[], period: string) {
  const result = new Map<string, PayItem[]>();
  for (const run of runs) {
    if (run.status !== "Locked" || run.period !== period) {
      continue;
    }
    for (const line of run.lines) {
      if (line.amount > 0) {
        result.set(line.employeeId, [
          ...(result.get(line.employeeId) ?? []),
          {
            componentId: run.id,
            code: "MIDMONTH",
            name: "Mid-month payment",
            amount: line.amount,
            taxable: false,
          },
        ]);
      }
    }
  }
  return result;
}

export function midMonthTotals(lines: MidMonthLine[]) {
  const paid = lines.filter((line) => line.amount > 0);
  return {
    employees: paid.length,
    amount: round2(paid.reduce((sum, line) => sum + line.amount, 0)),
    basicSalary: round2(paid.reduce((sum, line) => sum + line.basicSalary, 0)),
  };
}

export function midMonthBankTotals(lines: MidMonthLine[]) {
  const groups = new Map<string, { bankName: string; count: number; amount: number }>();
  for (const line of lines) {
    if (line.amount <= 0) {
      continue;
    }
    const key = line.bankName || "No bank";
    const group = groups.get(key) ?? { bankName: key, count: 0, amount: 0 };
    group.count += 1;
    group.amount = round2(group.amount + line.amount);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}
