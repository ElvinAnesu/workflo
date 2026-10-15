// Settings ----------------------------------------------------------------

export const PAY_COMPONENT_TYPES = ["Earning", "Deduction"] as const;
export type PayComponentType = (typeof PAY_COMPONENT_TYPES)[number];

export const PAY_COMPONENT_CALCULATIONS = [
  "Fixed amount",
  "% of basic salary",
] as const;
export type PayComponentCalculation =
  (typeof PAY_COMPONENT_CALCULATIONS)[number];

export type PayComponent = {
  id: string;
  code: string;
  name: string;
  type: PayComponentType;
  calculation: PayComponentCalculation;
  defaultValue: number;
  // Earnings only: whether the amount is subject to PAYE.
  taxable: boolean;
  active: boolean;
};

export const CONTRIBUTION_BASES = ["Gross pay", "Basic salary"] as const;
export type ContributionBase = (typeof CONTRIBUTION_BASES)[number];

export const CONTRIBUTION_SCOPES = [
  "All employees",
  "Selected employees",
] as const;
export type ContributionScope = (typeof CONTRIBUTION_SCOPES)[number];

export type StatutoryContribution = {
  id: string;
  code: string;
  name: string;
  base: ContributionBase;
  employeeRate: number;
  employerRate: number;
  // Employee share is deducted from income before PAYE is calculated.
  deductBeforeTax: boolean;
  scope: ContributionScope;
  active: boolean;
};

// A progressive band: income above `from` up to `to` is taxed at `rate` %.
// `to` of null means "and above".
export type TaxBand = {
  id: string;
  from: number;
  to: number | null;
  rate: number;
};

export type Bank = {
  id: string;
  name: string;
  code: string;
};

export type PayrollSettings = {
  components: PayComponent[];
  contributions: StatutoryContribution[];
  taxBands: TaxBand[];
};

// Employee pay setup ------------------------------------------------------

export type AssignedComponent = {
  componentId: string;
  // Amount for fixed components, percentage for % of basic.
  value: number;
};

export type EmployeePayProfile = {
  employeeId: string;
  basicSalary: number;
  components: AssignedComponent[];
  bankId: string;
  accountNumber: string;
  // Contributions scoped to "Selected employees" that apply to this person.
  contributionIds: string[];
};

export type SalaryHold = {
  id: string;
  employeeId: string;
  fromPeriod: string;
  toPeriod: string;
  reason: string;
  createdOn: string;
  releasedOn: string;
};

// Calculation results -----------------------------------------------------

export type PayItem = {
  componentId: string;
  code: string;
  name: string;
  amount: number;
  taxable: boolean;
};

export type ContributionLine = {
  contributionId: string;
  code: string;
  name: string;
  baseAmount: number;
  employee: number;
  employer: number;
  deductBeforeTax: boolean;
};

export type PayCalculation = {
  basicSalary: number;
  earnings: PayItem[];
  grossPay: number;
  taxableEarnings: number;
  contributions: ContributionLine[];
  preTaxDeductions: number;
  taxableIncome: number;
  paye: number;
  deductions: PayItem[];
  employeeContributions: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  employerCost: number;
};

// Payroll runs --------------------------------------------------------------

export type PayrollRunStatus = "Draft" | "Approved" | "Locked";

export type PayrollLine = PayCalculation & {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  bankName: string;
  accountNumber: string;
  held: boolean;
  holdReason: string;
  warnings: string[];
};

export type ExcludedEmployee = {
  employeeId: string;
  employeeName: string;
  reason: string;
};

export type PayrollRun = {
  id: string;
  period: string;
  status: PayrollRunStatus;
  createdOn: string;
  calculatedOn: string;
  approvedBy: string;
  approvedOn: string;
  lockedOn: string;
  // Contribution columns in the order they were configured at calculation.
  contributionColumns: { contributionId: string; code: string; name: string }[];
  lines: PayrollLine[];
  excluded: ExcludedEmployee[];
};

// Loans, salary advances and payment recoveries ------------------------------
// All three are amounts an employee repays through monthly payroll
// deductions, so they share one model.

export const DEDUCTION_PLAN_KINDS = ["Loan", "Advance", "Recovery"] as const;
export type DeductionPlanKind = (typeof DEDUCTION_PLAN_KINDS)[number];

export type DeductionPlanStatus =
  | "Pending"
  | "Rejected"
  | "Active"
  | "Paused"
  | "Closed";

export type ManualRepayment = {
  id: string;
  date: string;
  amount: number;
  note: string;
};

export type DeductionPlan = {
  id: string;
  kind: DeductionPlanKind;
  employeeId: string;
  category: string;
  reason: string;
  principal: number;
  // Flat interest on the principal, loans only.
  interestRate: number;
  // Amount to recover: principal plus interest.
  total: number;
  // Deducted each payroll month until the total is recovered.
  installment: number;
  // First payroll month to deduct from.
  startPeriod: string;
  status: DeductionPlanStatus;
  requestedOn: string;
  approvedBy: string;
  approvedOn: string;
  // Date the money was paid to the employee (loans and advances).
  disbursedOn: string;
  closedOn: string;
  closeReason: string;
  repayments: ManualRepayment[];
};

// Mid-month payroll ----------------------------------------------------------

export const MID_MONTH_BASES = ["% of basic salary", "Fixed amount"] as const;
export type MidMonthBasis = (typeof MID_MONTH_BASES)[number];

export type MidMonthLine = {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  basicSalary: number;
  // Net pay the month-end payroll would produce, before this payment.
  estimatedNet: number;
  defaultAmount: number;
  amount: number;
  overridden: boolean;
  bankName: string;
  accountNumber: string;
  warnings: string[];
};

export type MidMonthRun = {
  id: string;
  period: string;
  status: PayrollRunStatus;
  basis: MidMonthBasis;
  value: number;
  paymentDate: string;
  createdOn: string;
  calculatedOn: string;
  approvedBy: string;
  approvedOn: string;
  lockedOn: string;
  lines: MidMonthLine[];
  excluded: ExcludedEmployee[];
};

// Overtime ---------------------------------------------------------------------

export type OvertimeType = {
  id: string;
  code: string;
  name: string;
  // Hourly rate multiplier, e.g. 1.5 for time and a half.
  multiplier: number;
  taxable: boolean;
  active: boolean;
};

export type OvertimeSettings = {
  // Basic salary divided by this gives the hourly rate. 0 means not set.
  standardMonthlyHours: number;
};

export type OvertimeEntry = {
  id: string;
  employeeId: string;
  typeId: string;
  date: string;
  hours: number;
  note: string;
};

export type OvertimeLineItem = {
  typeId: string;
  code: string;
  name: string;
  multiplier: number;
  taxable: boolean;
  hours: number;
  amount: number;
};

export type OvertimeLine = {
  employeeId: string;
  employeeName: string;
  department: string;
  basicSalary: number;
  hourlyRate: number;
  items: OvertimeLineItem[];
  hours: number;
  amount: number;
};

export type OvertimeRun = {
  id: string;
  // Month the overtime was worked.
  period: string;
  // Monthly payroll the overtime is paid in.
  payPeriod: string;
  status: PayrollRunStatus;
  entries: OvertimeEntry[];
  lines: OvertimeLine[];
  excluded: ExcludedEmployee[];
  createdOn: string;
  calculatedOn: string;
  approvedBy: string;
  approvedOn: string;
  lockedOn: string;
};

export type PayrollListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
  status: string;
};

export type BankListRow = {
  id: number;
  name: string;
  code: string;
  employeeCount: number;
};

export type PayComponentListRow = PayComponent & { id: string; assignmentCount: number };

export type ContributionListRow = StatutoryContribution & { id: string };

export type PayAssignmentRow = {
  id: number;
  employeeCode: string;
  name: string;
  department: string;
  status: string;
  basicSalary: number;
  componentCount: number;
  grossPay: number;
  bank: string;
};

export type HoldListRow = SalaryHold & {
  id: string;
  employeeName: string;
  employeeCode: string;
  holdStatus: string;
};

export type PlanListRow = {
  id: number;
  reference: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  category: string;
  reason: string;
  principal: number;
  interestRate: number;
  total: number;
  installment: number;
  startPeriod: string;
  status: DeductionPlanStatus;
  displayStatus: DeductionPlanStatus | "Completed";
  recovered: number;
  outstanding: number;
  requestedOn: string;
};

export type RunListRow = {
  id: number;
  period: string;
  status: PayrollRunStatus;
  employees: number;
  grossPay: number;
  paye: number;
  netPayable: number;
  employerCost: number;
  createdOn: string;
};

export type PayslipListRow = {
  key: string;
  runId: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  department: string;
  period: string;
  runStatus: "Approved" | "Locked";
  netPay: number;
  held: boolean;
};
