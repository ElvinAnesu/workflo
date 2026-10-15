import { calculateEmployeePay } from "./payroll-engine.ts";
import type { PeriodAdjustments } from "./payroll-inputs.ts";
import type {
  Bank,
  EmployeePayProfile,
  ExcludedEmployee,
  PayrollLine,
  PayrollRun,
  PayrollSettings,
  SalaryHold,
} from "@/components/payroll/payroll.types";

// Builds the lines of a payroll run from employees, their pay profiles and
// the payroll settings. Pure, so it can be tested without a browser.

export type PayrollEmployee = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  department: string;
  designation: string;
  status: string;
};

export type PayrollRunInput = {
  period: string;
  employees: PayrollEmployee[];
  profiles: EmployeePayProfile[];
  holds: SalaryHold[];
  banks: Bank[];
  settings: PayrollSettings;
  // Overtime, mid-month and loan, advance and recovery items for the month.
  adjustments?: PeriodAdjustments;
};

export function employeeFullName(employee: PayrollEmployee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ");
}

export function isHoldActive(hold: SalaryHold, period: string) {
  return (
    !hold.releasedOn &&
    hold.fromPeriod <= period &&
    (!hold.toPeriod || period <= hold.toPeriod)
  );
}

export function formatPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) {
    return period;
  }
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function buildPayrollRunLines({
  period,
  employees,
  profiles,
  holds,
  banks,
  settings,
  adjustments,
}: PayrollRunInput): Pick<
  PayrollRun,
  "lines" | "excluded" | "contributionColumns"
> {
  const lines: PayrollLine[] = [];
  const excluded: ExcludedEmployee[] = [];

  for (const employee of employees) {
    const employeeName = employeeFullName(employee);

    if (employee.status !== "Active") {
      continue;
    }

    const profile = profiles.find((item) => item.employeeId === employee.id);

    if (!profile || !(profile.basicSalary > 0)) {
      excluded.push({
        employeeId: employee.id,
        employeeName,
        reason: "No basic salary set in Component assignment",
      });
      continue;
    }

    const extras = adjustments?.get(employee.id);
    const pay = calculateEmployeePay(
      {
        ...profile,
        extraEarnings: extras?.earnings,
        extraDeductions: extras?.deductions,
      },
      settings,
    );
    const hold = holds.find(
      (item) => item.employeeId === employee.id && isHoldActive(item, period),
    );
    const bank = banks.find((item) => item.id === profile.bankId);
    const warnings: string[] = [];

    if (pay.netPay < 0) {
      warnings.push("Net pay is negative: deductions exceed gross pay");
    } else if (pay.netPay === 0) {
      warnings.push("Net pay is zero");
    }
    if (!hold && (!bank || !profile.accountNumber.trim())) {
      warnings.push("Missing bank or account number");
    }

    lines.push({
      ...pay,
      employeeId: employee.id,
      employeeName,
      department: employee.department,
      designation: employee.designation,
      bankName: bank?.name ?? "",
      accountNumber: profile.accountNumber,
      held: Boolean(hold),
      holdReason: hold?.reason ?? "",
      warnings,
    });
  }

  return {
    lines,
    excluded,
    contributionColumns: settings.contributions
      .filter((contribution) => contribution.active)
      .map((contribution) => ({
        contributionId: contribution.id,
        code: contribution.code,
        name: contribution.name,
      })),
  };
}

export type PayrollTotals = {
  employees: number;
  basicSalary: number;
  grossPay: number;
  paye: number;
  employeeContributions: number;
  employerContributions: number;
  otherDeductions: number;
  netPay: number;
  netPayable: number;
  netHeld: number;
  employerCost: number;
};

export function payrollTotals(lines: PayrollLine[]): PayrollTotals {
  const total = (pick: (line: PayrollLine) => number) =>
    Math.round(lines.reduce((sum, line) => sum + pick(line), 0) * 100) / 100;

  return {
    employees: lines.length,
    basicSalary: total((line) => line.basicSalary),
    grossPay: total((line) => line.grossPay),
    paye: total((line) => line.paye),
    employeeContributions: total((line) => line.employeeContributions),
    employerContributions: total((line) => line.employerContributions),
    otherDeductions: total((line) => line.otherDeductions),
    netPay: total((line) => line.netPay),
    netPayable: total((line) => (line.held ? 0 : Math.max(0, line.netPay))),
    netHeld: total((line) => (line.held ? line.netPay : 0)),
    employerCost: total((line) => line.employerCost),
  };
}

export function contributionTotals(run: PayrollRun) {
  return run.contributionColumns.map((column) => {
    const matching = run.lines.flatMap((line) =>
      line.contributions.filter(
        (item) => item.contributionId === column.contributionId,
      ),
    );
    const employee =
      Math.round(matching.reduce((sum, item) => sum + item.employee, 0) * 100) /
      100;
    const employer =
      Math.round(matching.reduce((sum, item) => sum + item.employer, 0) * 100) /
      100;
    return {
      ...column,
      members: matching.length,
      employee,
      employer,
      total: Math.round((employee + employer) * 100) / 100,
    };
  });
}

export function bankTotals(lines: PayrollLine[]) {
  const groups = new Map<string, { bankName: string; count: number; amount: number }>();

  for (const line of lines) {
    if (line.held || line.netPay <= 0) {
      continue;
    }
    const key = line.bankName || "No bank";
    const group = groups.get(key) ?? { bankName: key, count: 0, amount: 0 };
    group.count += 1;
    group.amount = Math.round((group.amount + line.netPay) * 100) / 100;
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}
