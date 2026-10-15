import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateEmployeePay,
  calculatePaye,
  round2,
  validateTaxBands,
} from "./payroll-engine.ts";
import {
  bankTotals,
  buildPayrollRunLines,
  isHoldActive,
  payrollTotals,
  type PayrollEmployee,
} from "./payroll-run-builder.ts";
import type {
  EmployeePayProfile,
  PayrollSettings,
  SalaryHold,
  StatutoryContribution,
  TaxBand,
} from "./payroll.types.ts";

// Test fixture only: a Tanzania-mainland style configuration, as a company
// would enter it in Settings. The app itself ships with no rates.
const bands: TaxBand[] = [
  { id: "b1", from: 0, to: 270000, rate: 0 },
  { id: "b2", from: 270000, to: 520000, rate: 8 },
  { id: "b3", from: 520000, to: 760000, rate: 20 },
  { id: "b4", from: 760000, to: 1000000, rate: 25 },
  { id: "b5", from: 1000000, to: null, rate: 30 },
];

function contribution(
  overrides: Partial<StatutoryContribution> & Pick<StatutoryContribution, "id" | "code">,
): StatutoryContribution {
  return {
    name: overrides.code,
    base: "Gross pay",
    employeeRate: 0,
    employerRate: 0,
    deductBeforeTax: false,
    scope: "All employees",
    active: true,
    ...overrides,
  };
}

const nssf = contribution({
  id: "nssf",
  code: "NSSF",
  employeeRate: 10,
  employerRate: 10,
  deductBeforeTax: true,
});
const wcf = contribution({ id: "wcf", code: "WCF", employerRate: 0.5 });
const sdl = contribution({ id: "sdl", code: "SDL", employerRate: 3.5 });
const nhif = contribution({
  id: "nhif",
  code: "NHIF",
  base: "Basic salary",
  employeeRate: 3,
  employerRate: 3,
  scope: "Selected employees",
});

const settings: PayrollSettings = {
  components: [
    {
      id: "house",
      code: "HSE",
      name: "Housing allowance",
      type: "Earning",
      calculation: "% of basic salary",
      defaultValue: 10,
      taxable: true,
      active: true,
    },
    {
      id: "meal",
      code: "MEAL",
      name: "Meal allowance",
      type: "Earning",
      calculation: "Fixed amount",
      defaultValue: 50000,
      taxable: false,
      active: true,
    },
    {
      id: "union",
      code: "UNION",
      name: "Union dues",
      type: "Deduction",
      calculation: "% of basic salary",
      defaultValue: 2,
      taxable: false,
      active: true,
    },
    {
      id: "old",
      code: "OLD",
      name: "Retired allowance",
      type: "Earning",
      calculation: "Fixed amount",
      defaultValue: 99999,
      taxable: true,
      active: false,
    },
  ],
  contributions: [nssf, wcf, sdl, nhif],
  taxBands: bands,
};

function basicOnly(basicSalary: number, contributionIds: string[] = []) {
  return calculateEmployeePay(
    { basicSalary, components: [], contributionIds },
    settings,
  );
}

function line(result: ReturnType<typeof basicOnly>, code: string) {
  const found = result.contributions.find((item) => item.code === code);
  assert.ok(found, `${code} line missing`);
  return found;
}

describe("round2", () => {
  test("rounds half up to 2 decimals, including float edge cases", () => {
    assert.equal(round2(3376.8125), 3376.81);
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(23637.6875), 23637.69);
  });
});

describe("calculatePaye", () => {
  test("is zero at and below the zero-rate band", () => {
    assert.equal(calculatePaye(0, bands), 0);
    assert.equal(calculatePaye(-500, bands), 0);
    assert.equal(calculatePaye(270000, bands), 0);
  });

  test("taxes each slice at its own band rate (band boundaries)", () => {
    assert.equal(calculatePaye(520000, bands), 20000);
    assert.equal(calculatePaye(760000, bands), 68000);
    assert.equal(calculatePaye(1000000, bands), 128000);
    assert.equal(calculatePaye(1500000, bands), 278000);
  });

  test("does not depend on the order bands were entered in", () => {
    assert.equal(calculatePaye(1500000, [...bands].reverse()), 278000);
  });

  test("returns zero tax when no bands are configured", () => {
    assert.equal(calculatePaye(900000, []), 0);
  });
});

describe("validateTaxBands", () => {
  test("accepts a contiguous, open-ended set", () => {
    assert.deepEqual(validateTaxBands(bands), []);
  });

  test("rejects an empty set", () => {
    assert.equal(validateTaxBands([]).length, 1);
  });

  test("rejects gaps, overlaps, a non-zero start and a capped last band", () => {
    assert.ok(
      validateTaxBands([
        { id: "a", from: 0, to: 100, rate: 0 },
        { id: "b", from: 150, to: null, rate: 10 },
      ]).some((error) => error.includes("no gap or overlap")),
    );
    assert.ok(
      validateTaxBands([
        { id: "a", from: 0, to: 200, rate: 0 },
        { id: "b", from: 150, to: null, rate: 10 },
      ]).some((error) => error.includes("no gap or overlap")),
    );
    assert.ok(
      validateTaxBands([{ id: "a", from: 10, to: null, rate: 0 }]).some(
        (error) => error.includes("start at 0"),
      ),
    );
    assert.ok(
      validateTaxBands([{ id: "a", from: 0, to: 100, rate: 0 }]).some(
        (error) => error.includes("no upper limit"),
      ),
    );
    assert.ok(
      validateTaxBands([
        { id: "a", from: 0, to: null, rate: 0 },
        { id: "b", from: 100, to: null, rate: 10 },
      ]).some((error) => error.includes("only the last band")),
    );
    assert.ok(
      validateTaxBands([{ id: "a", from: 0, to: null, rate: 120 }]).some(
        (error) => error.includes("between 0 and 100"),
      ),
    );
    assert.ok(
      validateTaxBands([
        { id: "a", from: 0, to: Number.NaN, rate: 0 },
        { id: "b", from: Number.NaN, to: null, rate: 10 },
      ]).some((error) => error.includes("must be a number")),
    );
  });
});

describe("calculateEmployeePay: figures from the existing HESU payslip", () => {
  test("EMP002 gross 675,362.50", () => {
    const result = basicOnly(675362.5);
    assert.equal(result.grossPay, 675362.5);
    assert.equal(line(result, "NSSF").employee, 67536.25);
    assert.equal(line(result, "WCF").employer, 3376.81);
    assert.equal(line(result, "SDL").employer, 23637.69);
    assert.equal(result.taxableIncome, 607826.25);
    assert.equal(result.paye, 37565.25);
    assert.equal(result.netPay, 570261);
  });

  test("EMP425 gross 747,826", () => {
    const result = basicOnly(747826);
    assert.equal(line(result, "NSSF").employee, 74782.6);
    assert.equal(line(result, "WCF").employer, 3739.13);
    assert.equal(line(result, "SDL").employer, 26173.91);
  });

  test("EMP124 gross 1,051,163", () => {
    const result = basicOnly(1051163);
    assert.equal(line(result, "NSSF").employee, 105116.3);
    assert.equal(line(result, "WCF").employer, 5255.82);
    assert.equal(line(result, "SDL").employer, 36790.71);
  });
});

describe("calculateEmployeePay: components and contributions", () => {
  const result = calculateEmployeePay(
    {
      basicSalary: 1000000,
      components: [
        { componentId: "house", value: 10 },
        { componentId: "meal", value: 50000 },
        { componentId: "union", value: 2 },
        { componentId: "old", value: 99999 },
        { componentId: "missing", value: 123 },
      ],
      contributionIds: [],
    },
    settings,
  );

  test("applies % of basic and fixed earnings, skipping inactive or unknown", () => {
    assert.deepEqual(
      result.earnings.map((item) => [item.code, item.amount]),
      [
        ["HSE", 100000],
        ["MEAL", 50000],
      ],
    );
    assert.equal(result.grossPay, 1150000);
  });

  test("only taxable earnings are taxed; pre-tax contributions reduce taxable income", () => {
    assert.equal(result.taxableEarnings, 1100000);
    // NSSF is on gross: 10% of 1,150,000.
    assert.equal(line(result, "NSSF").employee, 115000);
    assert.equal(result.taxableIncome, 985000);
    assert.equal(result.paye, 124250);
  });

  test("deductions and totals reconcile", () => {
    assert.equal(result.otherDeductions, 20000);
    assert.equal(result.employeeContributions, 115000);
    assert.equal(result.totalDeductions, 115000 + 124250 + 20000);
    assert.equal(result.netPay, 1150000 - 259250);
    assert.equal(result.employerContributions, 115000 + 5750 + 40250);
    assert.equal(result.employerCost, 1150000 + 161000);
  });

  test("a 'Selected employees' contribution applies only when opted in, on its own base", () => {
    assert.equal(
      basicOnly(800000).contributions.some((item) => item.code === "NHIF"),
      false,
    );
    const optedIn = calculateEmployeePay(
      {
        basicSalary: 800000,
        components: [{ componentId: "meal", value: 50000 }],
        contributionIds: ["nhif"],
      },
      settings,
    );
    // NHIF is on basic salary, not gross.
    assert.equal(line(optedIn, "NHIF").baseAmount, 800000);
    assert.equal(line(optedIn, "NHIF").employee, 24000);
    // Not deducted before tax, so taxable income only drops by NSSF.
    assert.equal(optedIn.taxableIncome, 800000 - 85000);
  });

  test("inactive contributions are ignored", () => {
    const withoutSdl = calculateEmployeePay(
      { basicSalary: 500000, components: [], contributionIds: [] },
      {
        ...settings,
        contributions: settings.contributions.map((item) =>
          item.id === "sdl" ? { ...item, active: false } : item,
        ),
      },
    );
    assert.equal(
      withoutSdl.contributions.some((item) => item.code === "SDL"),
      false,
    );
  });

  test("taxable income never goes below zero", () => {
    const result = calculateEmployeePay(
      { basicSalary: 100000, components: [], contributionIds: [] },
      {
        ...settings,
        contributions: [{ ...nssf, employeeRate: 150 }],
      },
    );
    assert.equal(result.taxableIncome, 0);
    assert.equal(result.paye, 0);
  });
});

describe("buildPayrollRunLines", () => {
  const employees: PayrollEmployee[] = [
    { id: "E1", firstName: "Asha", middleName: "", lastName: "Mrema", department: "Finance", designation: "Accountant", status: "Active" },
    { id: "E2", firstName: "Baraka", middleName: "J", lastName: "Juma", department: "Ops", designation: "Clerk", status: "Active" },
    { id: "E3", firstName: "Chausiku", middleName: "", lastName: "Ali", department: "Ops", designation: "Driver", status: "Terminated" },
    { id: "E4", firstName: "Daudi", middleName: "", lastName: "Mushi", department: "Ops", designation: "Guard", status: "Active" },
    { id: "E5", firstName: "Eliza", middleName: "", lastName: "Kimaro", department: "HR", designation: "Officer", status: "Active" },
  ];
  const profile = (
    employeeId: string,
    basicSalary: number,
    extra: Partial<EmployeePayProfile> = {},
  ): EmployeePayProfile => ({
    employeeId,
    basicSalary,
    components: [],
    bankId: "crdb",
    accountNumber: "0150000000",
    contributionIds: [],
    ...extra,
  });
  const holds: SalaryHold[] = [
    { id: "H1", employeeId: "E5", fromPeriod: "2026-09", toPeriod: "", reason: "Disciplinary review", createdOn: "2026-09-01", releasedOn: "" },
  ];

  const run = buildPayrollRunLines({
    period: "2026-10",
    employees,
    profiles: [
      profile("E1", 675362.5),
      profile("E2", 400000, { bankId: "" }),
      profile("E3", 900000),
      profile("E5", 600000, { bankId: "" }),
      profile("E4", 0),
    ],
    holds,
    banks: [{ id: "crdb", name: "CRDB Bank", code: "CORUTZTZ" }],
    settings,
  });

  test("skips non-active employees and excludes those without a salary", () => {
    assert.deepEqual(
      run.lines.map((item) => item.employeeId),
      ["E1", "E2", "E5"],
    );
    assert.deepEqual(
      run.excluded.map((item) => item.employeeId),
      ["E4"],
    );
  });

  test("flags a missing bank unless the pay is on hold", () => {
    const byId = Object.fromEntries(run.lines.map((item) => [item.employeeId, item]));
    assert.deepEqual(byId.E1.warnings, []);
    assert.ok(byId.E2.warnings.some((w) => w.includes("bank")));
    assert.equal(byId.E5.held, true);
    assert.deepEqual(byId.E5.warnings, []);
  });

  test("totals keep held pay out of the amount payable", () => {
    const totals = payrollTotals(run.lines);
    const e5 = run.lines.find((item) => item.employeeId === "E5")!;
    assert.equal(totals.netHeld, e5.netPay);
    assert.equal(
      totals.netPayable,
      round2(totals.netPay - e5.netPay),
    );
    assert.equal(
      bankTotals(run.lines).reduce((sum, group) => sum + group.count, 0),
      2,
    );
  });

  test("lists contribution columns in configured order, active only", () => {
    assert.deepEqual(
      run.contributionColumns.map((item) => item.code),
      ["NSSF", "WCF", "SDL", "NHIF"],
    );
  });

  test("flags negative net pay", () => {
    const negative = buildPayrollRunLines({
      period: "2026-10",
      employees: [employees[0]],
      profiles: [
        profile("E1", 300000, {
          components: [{ componentId: "union", value: 95 }],
        }),
      ],
      holds: [],
      banks: [{ id: "crdb", name: "CRDB Bank", code: "" }],
      settings,
    });
    assert.ok(negative.lines[0].netPay < 0);
    assert.ok(negative.lines[0].warnings.some((w) => w.includes("negative")));
  });
});

describe("isHoldActive", () => {
  const hold: SalaryHold = {
    id: "H",
    employeeId: "E",
    fromPeriod: "2026-03",
    toPeriod: "2026-05",
    reason: "",
    createdOn: "",
    releasedOn: "",
  };

  test("is active only within its period range", () => {
    assert.equal(isHoldActive(hold, "2026-02"), false);
    assert.equal(isHoldActive(hold, "2026-03"), true);
    assert.equal(isHoldActive(hold, "2026-05"), true);
    assert.equal(isHoldActive(hold, "2026-06"), false);
  });

  test("open-ended holds run until released", () => {
    assert.equal(isHoldActive({ ...hold, toPeriod: "" }, "2030-01"), true);
    assert.equal(
      isHoldActive({ ...hold, toPeriod: "", releasedOn: "2026-04-10" }, "2026-04"),
      false,
    );
  });
});
