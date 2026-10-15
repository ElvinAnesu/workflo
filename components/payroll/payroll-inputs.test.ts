import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addMonths,
  installmentFor,
  loanTotal,
  monthsToRepay,
  planBalance,
  planDisplayStatus,
  planInstallmentForPeriod,
  planSchedule,
} from "./deduction-plans.ts";
import { buildMidMonthLines, midMonthDefaultAmount } from "./mid-month.ts";
import { buildOvertimeLines, overtimeEarningsForPeriod, overtimeReadiness } from "./overtime.ts";
import { periodAdjustments } from "./payroll-inputs.ts";
import { buildPayrollRunLines, type PayrollEmployee } from "./payroll-run-builder.ts";
import type {
  DeductionPlan,
  EmployeePayProfile,
  MidMonthRun,
  OvertimeRun,
  OvertimeType,
  PayrollRun,
  PayrollSettings,
} from "./payroll.types.ts";

// Test fixture only: a flat 10% PAYE band set, as a company would enter it
// in Settings. The app itself ships with no rates.
const settings: PayrollSettings = {
  components: [],
  contributions: [],
  taxBands: [{ id: "b1", from: 0, to: null, rate: 10 }],
};

const employees: PayrollEmployee[] = [
  { id: "E1", firstName: "Asha", middleName: "", lastName: "Mrema", department: "Finance", designation: "Accountant", status: "Active" },
  { id: "E2", firstName: "Baraka", middleName: "", lastName: "Juma", department: "Ops", designation: "Clerk", status: "Active" },
  { id: "E3", firstName: "Chausiku", middleName: "", lastName: "Ali", department: "Ops", designation: "Driver", status: "Active" },
];

const profile = (employeeId: string, basicSalary: number): EmployeePayProfile => ({
  employeeId,
  basicSalary,
  components: [],
  bankId: "BK-1",
  accountNumber: "123",
  contributionIds: [],
});

const profiles = [profile("E1", 1_000_000), profile("E2", 400_000)];
const banks = [{ id: "BK-1", name: "CRDB", code: "" }];

function plan(overrides: Partial<DeductionPlan> = {}): DeductionPlan {
  return {
    id: "LN-0001",
    kind: "Loan",
    employeeId: "E1",
    category: "",
    reason: "School fees",
    principal: 250_000,
    interestRate: 0,
    total: 250_000,
    installment: 100_000,
    startPeriod: "2026-01",
    status: "Active",
    requestedOn: "2025-12-20",
    approvedBy: "HR",
    approvedOn: "2025-12-21",
    disbursedOn: "2025-12-22",
    closedOn: "",
    closeReason: "",
    repayments: [],
    ...overrides,
  };
}

function monthlyRun(period: string, status: PayrollRun["status"], plans: DeductionPlan[], runs: PayrollRun[] = []): PayrollRun {
  const id = `PR-${period}`;
  return {
    id,
    period,
    status,
    createdOn: "",
    calculatedOn: "",
    approvedBy: "",
    approvedOn: "",
    lockedOn: "",
    ...buildPayrollRunLines({
      period,
      employees,
      profiles,
      holds: [],
      banks,
      settings,
      adjustments: periodAdjustments({
        period,
        plans,
        runs,
        midMonthRuns: [],
        overtimeRuns: [],
        excludeRunId: id,
      }),
    }),
  };
}

describe("deduction plan maths", () => {
  test("flat interest, installments and months", () => {
    assert.equal(loanTotal(1_000_000, 12), 1_120_000);
    assert.equal(installmentFor(100, 3), 33.34);
    assert.equal(monthsToRepay(100, 33.34), 3);
    assert.equal(monthsToRepay(250_000, 100_000), 3);
    assert.equal(addMonths("2026-11", 3), "2027-02");
  });

  test("deducts the installment, then only what is left", () => {
    const loan = plan();
    const jan = monthlyRun("2026-01", "Locked", [loan]);
    const feb = monthlyRun("2026-02", "Locked", [loan], [jan]);
    const mar = monthlyRun("2026-03", "Draft", [loan], [jan, feb]);

    const deducted = (run: PayrollRun) =>
      run.lines.find((line) => line.employeeId === "E1")!.deductions.find((item) => item.componentId === "LN-0001")?.amount;
    assert.equal(deducted(jan), 100_000);
    assert.equal(deducted(feb), 100_000);
    assert.equal(deducted(mar), 50_000);

    const balance = planBalance(loan, [jan, feb, mar]);
    assert.equal(balance.recoveredPayroll, 200_000);
    assert.equal(balance.pendingPayroll, 50_000);
    assert.equal(balance.outstanding, 50_000);
    assert.equal(planInstallmentForPeriod(loan, "2026-04", [jan, feb, mar]), 0);
  });

  test("loan repayment reduces net pay after tax, not taxable income", () => {
    const jan = monthlyRun("2026-01", "Draft", [plan()]);
    const line = jan.lines.find((item) => item.employeeId === "E1")!;
    assert.equal(line.taxableIncome, 1_000_000);
    assert.equal(line.paye, 100_000);
    assert.equal(line.netPay, 800_000);
  });

  test("recalculating a run does not count its own earlier deduction", () => {
    const loan = plan();
    const first = monthlyRun("2026-01", "Draft", [loan]);
    const again = monthlyRun("2026-01", "Draft", [loan], [first]);
    assert.equal(planInstallmentForPeriod(loan, "2026-01", [first], first.id), 100_000);
    assert.equal(again.lines[0].otherDeductions, 100_000);
  });

  test("paused, pending and future plans are not deducted", () => {
    assert.equal(planInstallmentForPeriod(plan({ status: "Paused" }), "2026-01", []), 0);
    assert.equal(planInstallmentForPeriod(plan({ status: "Pending" }), "2026-01", []), 0);
    assert.equal(planInstallmentForPeriod(plan({ startPeriod: "2026-05" }), "2026-01", []), 0);
  });

  test("manual repayments count towards the balance and completion", () => {
    const loan = plan({ repayments: [{ id: "RP-001", date: "2026-01-05", amount: 250_000, note: "" }] });
    assert.equal(planInstallmentForPeriod(loan, "2026-01", []), 0);
    assert.equal(planDisplayStatus(loan, []), "Completed");
  });

  test("schedule shows payroll months then projects the rest", () => {
    const loan = plan();
    const jan = monthlyRun("2026-01", "Locked", [loan]);
    const rows = planSchedule(loan, [jan]);
    assert.deepEqual(
      rows.map((row) => [row.period, row.amount, row.source, row.balanceAfter]),
      [
        ["2026-01", 100_000, "Locked", 150_000],
        ["2026-02", 100_000, "Projected", 50_000],
        ["2026-03", 50_000, "Projected", 0],
      ],
    );
  });
});

const overtimeTypes: OvertimeType[] = [
  { id: "OTT-001", code: "OT15", name: "Weekday", multiplier: 1.5, taxable: true, active: true },
  { id: "OTT-002", code: "OT20", name: "Public holiday", multiplier: 2, taxable: true, active: true },
];

describe("overtime", () => {
  test("needs standard hours and an active rate", () => {
    assert.equal(overtimeReadiness([], { standardMonthlyHours: 0 }).length, 2);
    assert.equal(overtimeReadiness(overtimeTypes, { standardMonthlyHours: 200 }).length, 0);
  });

  test("pays hours × basic ÷ standard hours × multiplier", () => {
    const { lines, excluded } = buildOvertimeLines({
      entries: [
        { id: "1", employeeId: "E1", typeId: "OTT-001", date: "2026-01-05", hours: 4, note: "" },
        { id: "2", employeeId: "E1", typeId: "OTT-001", date: "2026-01-06", hours: 2, note: "" },
        { id: "3", employeeId: "E1", typeId: "OTT-002", date: "2026-01-01", hours: 8, note: "" },
        { id: "4", employeeId: "E3", typeId: "OTT-001", date: "2026-01-07", hours: 3, note: "" },
      ],
      employees,
      profiles,
      types: overtimeTypes,
      settings: { standardMonthlyHours: 200 },
    });
    // Hourly rate 5,000: 6h × 1.5 = 45,000 and 8h × 2 = 80,000.
    assert.equal(lines[0].hourlyRate, 5000);
    assert.deepEqual(lines[0].items.map((item) => item.amount), [45_000, 80_000]);
    assert.equal(lines[0].amount, 125_000);
    assert.equal(lines[0].hours, 14);
    assert.deepEqual(excluded.map((item) => item.employeeId), ["E3"]);
  });

  test("locked overtime is a taxable earning in its pay month", () => {
    const run: OvertimeRun = {
      id: "OT-2026-01",
      period: "2026-01",
      payPeriod: "2026-02",
      status: "Locked",
      entries: [],
      ...buildOvertimeLines({
        entries: [{ id: "1", employeeId: "E1", typeId: "OTT-001", date: "2026-01-05", hours: 10, note: "" }],
        employees,
        profiles,
        types: overtimeTypes,
        settings: { standardMonthlyHours: 200 },
      }),
      createdOn: "",
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
    };
    assert.equal(overtimeEarningsForPeriod([run], "2026-01").size, 0);
    assert.equal(overtimeEarningsForPeriod([{ ...run, status: "Approved" }], "2026-02").size, 0);

    const { lines } = buildPayrollRunLines({
      period: "2026-02",
      employees,
      profiles,
      holds: [],
      banks,
      settings,
      adjustments: periodAdjustments({ period: "2026-02", plans: [], runs: [], midMonthRuns: [], overtimeRuns: [run] }),
    });
    const line = lines.find((item) => item.employeeId === "E1")!;
    assert.equal(line.grossPay, 1_075_000);
    assert.equal(line.paye, 107_500);
  });
});

describe("mid-month payroll", () => {
  test("default amount by basis", () => {
    assert.equal(midMonthDefaultAmount("% of basic salary", 40, 1_000_000), 400_000);
    assert.equal(midMonthDefaultAmount("Fixed amount", 150_000, 1_000_000), 150_000);
  });

  test("builds lines, keeps overrides and warns above estimated net", () => {
    const { lines, excluded } = buildMidMonthLines({
      period: "2026-01",
      basis: "% of basic salary",
      value: 95,
      employees,
      profiles,
      holds: [],
      banks,
      settings,
      adjustments: new Map(),
      overrides: new Map([["E2", 100_000]]),
    });
    const asha = lines.find((line) => line.employeeId === "E1")!;
    assert.equal(asha.estimatedNet, 900_000);
    assert.equal(asha.amount, 950_000);
    assert.deepEqual(asha.warnings, ["More than the estimated net pay for the month"]);
    const baraka = lines.find((line) => line.employeeId === "E2")!;
    assert.equal(baraka.amount, 100_000);
    assert.equal(baraka.overridden, true);
    assert.deepEqual(excluded.map((item) => item.employeeId), ["E3"]);
  });

  test("locked mid-month pay is deducted in the monthly payroll", () => {
    const mid: MidMonthRun = {
      id: "MM-2026-01",
      period: "2026-01",
      status: "Locked",
      basis: "% of basic salary",
      value: 40,
      paymentDate: "2026-01-15",
      createdOn: "",
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
      ...buildMidMonthLines({
        period: "2026-01",
        basis: "% of basic salary",
        value: 40,
        employees,
        profiles,
        holds: [],
        banks,
        settings,
        adjustments: new Map(),
        overrides: new Map(),
      }),
    };
    const { lines } = buildPayrollRunLines({
      period: "2026-01",
      employees,
      profiles,
      holds: [],
      banks,
      settings,
      adjustments: periodAdjustments({ period: "2026-01", plans: [], runs: [], midMonthRuns: [mid], overtimeRuns: [] }),
    });
    const line = lines.find((item) => item.employeeId === "E1")!;
    assert.equal(line.paye, 100_000);
    assert.equal(line.netPay, 500_000);
  });
});
