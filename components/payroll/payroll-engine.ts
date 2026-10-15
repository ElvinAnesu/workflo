import type {
  AssignedComponent,
  ContributionLine,
  PayCalculation,
  PayItem,
  PayrollSettings,
  TaxBand,
} from "@/components/payroll/payroll.types";

// Pure payroll calculations. Every rate comes from the settings passed in;
// nothing statutory is hard-coded here.

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sum(values: number[]) {
  return round2(values.reduce((total, value) => total + value, 0));
}

export function sortTaxBands(bands: TaxBand[]) {
  return [...bands].sort((a, b) => a.from - b.from);
}

// Returns human-readable problems; an empty array means the bands are usable.
export function validateTaxBands(bands: TaxBand[]) {
  const errors: string[] = [];

  if (bands.length === 0) {
    return ["Add at least one tax band."];
  }

  const sorted = sortTaxBands(bands);

  if (sorted[0].from !== 0) {
    errors.push("The first band must start at 0.");
  }

  sorted.forEach((band, index) => {
    const label = `Band ${index + 1}`;
    const isLast = index === sorted.length - 1;

    if (!Number.isFinite(band.from) || band.from < 0) {
      errors.push(`${label}: "from" must be 0 or more.`);
    }
    if (!Number.isFinite(band.rate) || band.rate < 0 || band.rate > 100) {
      errors.push(`${label}: rate must be between 0 and 100.`);
    }
    if (band.to !== null && !Number.isFinite(band.to)) {
      errors.push(`${label}: "up to" must be a number.`);
      return;
    }
    if (band.to === null) {
      if (!isLast) {
        errors.push(`${label}: only the last band can be open-ended.`);
      }
    } else if (band.to <= band.from) {
      errors.push(`${label}: "to" must be greater than "from".`);
    }
    if (!isLast) {
      const next = sorted[index + 1];
      if (band.to !== null && next.from !== band.to) {
        errors.push(
          `${label} ends at ${band.to} but the next band starts at ${next.from}. Bands must join with no gap or overlap.`,
        );
      }
    }
  });

  if (sorted[sorted.length - 1].to !== null) {
    errors.push(
      "The last band must have no upper limit, so every income level is covered.",
    );
  }

  return errors;
}

export function calculatePaye(taxableIncome: number, bands: TaxBand[]) {
  if (taxableIncome <= 0) {
    return 0;
  }

  let tax = 0;

  for (const band of sortTaxBands(bands)) {
    const upper = band.to ?? Number.POSITIVE_INFINITY;
    const portion = Math.min(taxableIncome, upper) - band.from;

    if (portion > 0) {
      tax += (portion * band.rate) / 100;
    }
  }

  return round2(tax);
}

export type EmployeePayInput = {
  basicSalary: number;
  components: AssignedComponent[];
  contributionIds: string[];
  // Period inputs from outside the pay profile: overtime earnings, and
  // loan, advance, recovery and mid-month deductions.
  extraEarnings?: PayItem[];
  extraDeductions?: PayItem[];
};

export function calculateEmployeePay(
  input: EmployeePayInput,
  settings: PayrollSettings,
): PayCalculation {
  const basicSalary = round2(Math.max(0, input.basicSalary || 0));
  const earnings: PayItem[] = [];
  const deductions: PayItem[] = [];

  for (const assigned of input.components) {
    const component = settings.components.find(
      (item) => item.id === assigned.componentId,
    );

    if (!component || !component.active) {
      continue;
    }

    const value = Number(assigned.value) || 0;
    const amount = round2(
      component.calculation === "% of basic salary"
        ? (basicSalary * value) / 100
        : value,
    );
    const item: PayItem = {
      componentId: component.id,
      code: component.code,
      name: component.name,
      amount,
      taxable: component.type === "Earning" && component.taxable,
    };

    if (component.type === "Earning") {
      earnings.push(item);
    } else {
      deductions.push(item);
    }
  }

  earnings.push(...(input.extraEarnings ?? []));
  deductions.push(...(input.extraDeductions ?? []));

  const grossPay = sum([basicSalary, ...earnings.map((item) => item.amount)]);
  const taxableEarnings = sum([
    basicSalary,
    ...earnings.filter((item) => item.taxable).map((item) => item.amount),
  ]);

  const contributions: ContributionLine[] = settings.contributions
    .filter(
      (contribution) =>
        contribution.active &&
        (contribution.scope === "All employees" ||
          input.contributionIds.includes(contribution.id)),
    )
    .map((contribution) => {
      const baseAmount =
        contribution.base === "Basic salary" ? basicSalary : grossPay;
      return {
        contributionId: contribution.id,
        code: contribution.code,
        name: contribution.name,
        baseAmount,
        employee: round2((baseAmount * contribution.employeeRate) / 100),
        employer: round2((baseAmount * contribution.employerRate) / 100),
        deductBeforeTax: contribution.deductBeforeTax,
      };
    });

  const preTaxDeductions = sum(
    contributions
      .filter((line) => line.deductBeforeTax)
      .map((line) => line.employee),
  );
  const taxableIncome = round2(Math.max(0, taxableEarnings - preTaxDeductions));
  const paye = calculatePaye(taxableIncome, settings.taxBands);
  const employeeContributions = sum(contributions.map((line) => line.employee));
  const otherDeductions = sum(deductions.map((item) => item.amount));
  const totalDeductions = sum([employeeContributions, paye, otherDeductions]);
  const employerContributions = sum(contributions.map((line) => line.employer));

  return {
    basicSalary,
    earnings,
    grossPay,
    taxableEarnings,
    contributions,
    preTaxDeductions,
    taxableIncome,
    paye,
    deductions,
    employeeContributions,
    otherDeductions,
    totalDeductions,
    netPay: round2(grossPay - totalDeductions),
    employerContributions,
    employerCost: sum([grossPay, employerContributions]),
  };
}
