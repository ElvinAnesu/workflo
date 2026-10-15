import "server-only";
import { planBalance, planInstallmentForPeriod, loanTotal } from "@/components/payroll/deduction-plans";
import { buildMidMonthLines, midMonthWarnings } from "@/components/payroll/mid-month";
import { buildOvertimeLines, overtimeReadiness } from "@/components/payroll/overtime";
import { calculateEmployeePay, validateTaxBands } from "@/components/payroll/payroll-engine";
import { periodAdjustments } from "@/components/payroll/payroll-inputs";
import { buildPayrollRunLines, formatPeriod, isHoldActive, payrollTotals } from "@/components/payroll/payroll-run-builder";
import type {
  Bank,
  ContributionBase,
  ContributionScope,
  DeductionPlan,
  DeductionPlanKind,
  DeductionPlanStatus,
  EmployeePayProfile,
  MidMonthBasis,
  MidMonthRun,
  OvertimeEntry,
  OvertimeRun,
  OvertimeSettings,
  OvertimeType,
  PayComponent,
  PayComponentCalculation,
  PayComponentType,
  PayrollListQuery,
  PayrollRun,
  PayrollRunStatus,
  PayrollSettings,
  SalaryHold,
  StatutoryContribution,
  TaxBand,
} from "@/components/payroll/payroll.types";
import type { PayrollEmployee } from "@/components/payroll/payroll-run-builder";
import { getPool, sql } from "./db";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };
type Runner = sql.ConnectionPool | sql.Transaction;

const EMPLOYEE_NAME = `LTRIM(RTRIM(CONCAT(e.first_name, N' ', CASE WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N'' ELSE e.middle_name + N' ' END, e.last_name)))`;

const PLAN_REFERENCE = `
  CONCAT(
    CASE p.kind WHEN N'Loan' THEN N'LN-' WHEN N'Advance' THEN N'ADV-' ELSE N'REC-' END,
    CASE
      WHEN p.id < 10000 THEN RIGHT(CONCAT(N'0000', CONVERT(VARCHAR(10), p.id)), 4)
      ELSE CONVERT(VARCHAR(10), p.id)
    END
  )
`;

const READINESS_MESSAGE =
  "PAYE tax bands are not configured. Set them up in Settings → Tax bands before running payroll.";
const IN_USE = "This record is in use.";

export type EngineWorld = {
  employees: PayrollEmployee[];
  profiles: EmployeePayProfile[];
  holds: SalaryHold[];
  banks: Bank[];
  settings: PayrollSettings;
  plans: DeductionPlan[];
  runs: PayrollRun[];
  midMonthRuns: MidMonthRun[];
  overtimeRuns: OvertimeRun[];
  overtimeTypes: OvertimeType[];
  overtimeSettings: OvertimeSettings;
  employeeCodes: Map<string, string>;
};

async function requireCompany(): Promise<CompanySession | { error: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }
  return session as CompanySession;
}

function errorNumber(error: unknown) {
  return error && typeof error === "object" && "number" in error
    ? Number((error as { number: unknown }).number)
    : NaN;
}

function isUniqueError(error: unknown) {
  const number = errorNumber(error);
  return number === 2627 || number === 2601;
}

function isForeignKeyError(error: unknown) {
  return errorNumber(error) === 547;
}

function money(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flag(value: unknown) {
  return value === true || value === 1;
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validPeriod(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function warningsText(warnings: string[]) {
  return warnings.join("\n");
}

function warningsList(value: unknown) {
  const raw = text(value);
  return raw ? raw.split("\n").filter(Boolean) : [];
}

function orderBy(sortKey: string, direction: "asc" | "desc", columns: Record<string, string>, fallback: string) {
  const column = columns[sortKey] ?? fallback;
  return `${column} ${direction === "desc" ? "DESC" : "ASC"}`;
}

function emptyList() {
  return { rows: [] as never[], totalCount: 0 };
}

async function query<T>(runner: Runner, statement: string, inputs: Record<string, { type: sql.ISqlTypeFactoryWithNoParams | sql.ISqlTypeWithLength | sql.ISqlTypeWithPrecisionScale; value: unknown }> = {}) {
  const request = runner instanceof sql.Transaction ? new sql.Request(runner) : new sql.Request(runner);
  for (const [name, input] of Object.entries(inputs)) {
    request.input(name, input.type as sql.ISqlType, input.value as never);
  }
  return request.query<T>(statement);
}

function input(type: sql.ISqlTypeFactoryWithNoParams, value: unknown) {
  return { type, value };
}

export async function loadEngineWorld(companyId: number, runner: Runner): Promise<EngineWorld> {
  const employees = await query<{
    id: number;
    employee_code: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    designation: string | null;
    status: string;
    department: string | null;
  }>(
    runner,
    `
      SELECT e.id, e.employee_code, e.first_name, e.middle_name, e.last_name, e.designation, e.status,
             d.name AS department
      FROM dbo.employees AS e
      LEFT JOIN dbo.departments AS d ON d.id = e.department_id AND d.company_id = e.company_id
      WHERE e.company_id = @companyId
    `,
    { companyId: input(sql.Int, companyId) },
  );
  const banks = await query<{ id: number; name: string; code: string }>(
    runner,
    `SELECT id, name, code FROM dbo.banks WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const components = await query<{
    id: number;
    code: string;
    name: string;
    type: PayComponentType;
    calculation: PayComponentCalculation;
    default_value: number;
    taxable: boolean;
    active: boolean;
  }>(
    runner,
    `SELECT id, code, name, type, calculation, default_value, taxable, active FROM dbo.pay_components WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const contributions = await query<{
    id: number;
    code: string;
    name: string;
    base: ContributionBase;
    employee_rate: number;
    employer_rate: number;
    deduct_before_tax: boolean;
    scope: ContributionScope;
    active: boolean;
  }>(
    runner,
    `SELECT id, code, name, base, employee_rate, employer_rate, deduct_before_tax, scope, active FROM dbo.statutory_contributions WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const bands = await query<{ id: number; band_from: number; band_to: number | null; rate: number }>(
    runner,
    `SELECT id, band_from, band_to, rate FROM dbo.tax_bands WHERE company_id = @companyId ORDER BY sort_order, id`,
    { companyId: input(sql.Int, companyId) },
  );
  const profiles = await query<{
    employee_id: number;
    basic_salary: number;
    bank_id: number | null;
    account_number: string;
  }>(
    runner,
    `SELECT employee_id, basic_salary, bank_id, account_number FROM dbo.employee_pay_profiles WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const assigned = await query<{ employee_id: number; pay_component_id: number; value: number }>(
    runner,
    `SELECT employee_id, pay_component_id, value FROM dbo.employee_pay_components WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const selected = await query<{ employee_id: number; statutory_contribution_id: number }>(
    runner,
    `SELECT employee_id, statutory_contribution_id FROM dbo.employee_pay_contributions WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const holds = await query<{
    id: number;
    employee_id: number;
    from_period: string;
    to_period: string | null;
    reason: string;
    created_on: Date;
    released_on: Date | null;
  }>(
    runner,
    `SELECT id, employee_id, from_period, to_period, reason, created_on, released_on FROM dbo.salary_holds WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const overtimeTypes = await query<{
    id: number;
    code: string;
    name: string;
    multiplier: number;
    taxable: boolean;
    active: boolean;
  }>(
    runner,
    `SELECT id, code, name, multiplier, taxable, active FROM dbo.overtime_types WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const hours = await query<{ standard_monthly_hours: number }>(
    runner,
    `SELECT standard_monthly_hours FROM dbo.overtime_settings WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const planRows = await query<{
    id: number;
    reference: string;
    kind: DeductionPlanKind;
    employee_id: number;
    category: string;
    reason: string;
    principal: number;
    interest_rate: number;
    total: number;
    installment: number;
    start_period: string;
    status: DeductionPlanStatus;
    requested_on: Date;
    approved_by: string;
    approved_on: Date | null;
    disbursed_on: Date | null;
    closed_on: Date | null;
    close_reason: string;
  }>(
    runner,
    `
      SELECT p.id, ${PLAN_REFERENCE} AS reference, p.kind, p.employee_id, p.category, p.reason,
             p.principal, p.interest_rate, p.total, p.installment, p.start_period, p.status,
             p.requested_on, p.approved_by, p.approved_on, p.disbursed_on, p.closed_on, p.close_reason
      FROM dbo.deduction_plans AS p
      WHERE p.company_id = @companyId
    `,
    { companyId: input(sql.Int, companyId) },
  );
  const repayments = await query<{
    id: number;
    deduction_plan_id: number;
    repaid_on: Date;
    amount: number;
    note: string;
  }>(
    runner,
    `SELECT id, deduction_plan_id, repaid_on, amount, note FROM dbo.deduction_repayments WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const monthly = await query<{ id: number; period: string; status: PayrollRunStatus }>(
    runner,
    `SELECT id, period, status FROM dbo.payroll_runs WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const deductions = await query<{
    payroll_run_id: number;
    employee_id: number;
    component_id: string;
    code: string;
    name: string;
    amount: number;
    taxable: boolean;
  }>(
    runner,
    `
      SELECT l.payroll_run_id, l.employee_id, d.component_id, d.code, d.name, d.amount, d.taxable
      FROM dbo.payroll_run_deductions AS d
      INNER JOIN dbo.payroll_run_lines AS l ON l.id = d.line_id AND l.company_id = d.company_id
      WHERE d.company_id = @companyId
    `,
    { companyId: input(sql.Int, companyId) },
  );
  const midRuns = await query<{ id: number; period: string; status: PayrollRunStatus }>(
    runner,
    `SELECT id, period, status FROM dbo.mid_month_runs WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const midLines = await query<{ mid_month_run_id: number; employee_id: number; amount: number }>(
    runner,
    `
      SELECT mid_month_run_id, employee_id, amount
      FROM dbo.mid_month_lines
      WHERE company_id = @companyId AND amount > 0
    `,
    { companyId: input(sql.Int, companyId) },
  );
  const otRuns = await query<{ id: number; period: string; pay_period: string; status: PayrollRunStatus }>(
    runner,
    `SELECT id, period, pay_period, status FROM dbo.overtime_runs WHERE company_id = @companyId`,
    { companyId: input(sql.Int, companyId) },
  );
  const otItems = await query<{
    overtime_run_id: number;
    employee_id: number;
    employee_name: string;
    department: string;
    basic_salary: number;
    hourly_rate: number;
    hours: number;
    amount: number;
    overtime_type_id: number;
    code: string;
    name: string;
    multiplier: number;
    taxable: boolean;
    item_hours: number;
    item_amount: number;
  }>(
    runner,
    `
      SELECT l.overtime_run_id, l.employee_id, l.employee_name, l.department, l.basic_salary,
             l.hourly_rate, l.hours, l.amount, i.overtime_type_id, i.code, i.name, i.multiplier,
             i.taxable, i.hours AS item_hours, i.amount AS item_amount
      FROM dbo.overtime_lines AS l
      INNER JOIN dbo.overtime_line_items AS i ON i.overtime_line_id = l.id AND i.company_id = l.company_id
      WHERE l.company_id = @companyId
    `,
    { companyId: input(sql.Int, companyId) },
  );

  const employeeCodes = new Map(employees.recordset.map((row) => [String(row.id), row.employee_code]));
  const profileComponents = new Map<number, { componentId: string; value: number }[]>();
  for (const row of assigned.recordset) {
    const list = profileComponents.get(row.employee_id) ?? [];
    list.push({ componentId: String(row.pay_component_id), value: money(row.value) });
    profileComponents.set(row.employee_id, list);
  }
  const profileContributions = new Map<number, string[]>();
  for (const row of selected.recordset) {
    const list = profileContributions.get(row.employee_id) ?? [];
    list.push(String(row.statutory_contribution_id));
    profileContributions.set(row.employee_id, list);
  }
  const repaymentMap = new Map<number, DeductionPlan["repayments"]>();
  for (const row of repayments.recordset) {
    const list = repaymentMap.get(row.deduction_plan_id) ?? [];
    list.push({
      id: String(row.id),
      date: formatDate(row.repaid_on),
      amount: money(row.amount),
      note: text(row.note),
    });
    repaymentMap.set(row.deduction_plan_id, list);
  }
  const deductionMap = new Map<number, PayrollRun["lines"]>();
  for (const row of deductions.recordset) {
    const lines = deductionMap.get(row.payroll_run_id) ?? [];
    let line = lines.find((item) => item.employeeId === String(row.employee_id));
    if (!line) {
      line = emptyLine(String(row.employee_id));
      lines.push(line);
    }
    line.deductions.push({
      componentId: row.component_id,
      code: row.code,
      name: row.name,
      amount: money(row.amount),
      taxable: flag(row.taxable),
    });
    deductionMap.set(row.payroll_run_id, lines);
  }

  const overtimeByRun = new Map<number, OvertimeRun["lines"]>();
  for (const row of otItems.recordset) {
    const lines = overtimeByRun.get(row.overtime_run_id) ?? [];
    let line = lines.find((item) => item.employeeId === String(row.employee_id));
    if (!line) {
      line = {
        employeeId: String(row.employee_id),
        employeeName: row.employee_name,
        department: text(row.department),
        basicSalary: money(row.basic_salary),
        hourlyRate: money(row.hourly_rate),
        items: [],
        hours: money(row.hours),
        amount: money(row.amount),
      };
      lines.push(line);
    }
    line.items.push({
      typeId: String(row.overtime_type_id),
      code: row.code,
      name: row.name,
      multiplier: money(row.multiplier),
      taxable: flag(row.taxable),
      hours: money(row.item_hours),
      amount: money(row.item_amount),
    });
    overtimeByRun.set(row.overtime_run_id, lines);
  }

  return {
    employeeCodes,
    employees: employees.recordset.map((row) => ({
      id: String(row.id),
      firstName: row.first_name,
      middleName: text(row.middle_name),
      lastName: row.last_name,
      department: text(row.department),
      designation: text(row.designation),
      status: row.status,
    })),
    banks: banks.recordset.map((row) => ({ id: String(row.id), name: row.name, code: row.code })),
    settings: {
      components: components.recordset.map((row) => ({
        id: String(row.id),
        code: row.code,
        name: row.name,
        type: row.type,
        calculation: row.calculation,
        defaultValue: money(row.default_value),
        taxable: flag(row.taxable),
        active: flag(row.active),
      })),
      contributions: contributions.recordset.map((row) => ({
        id: String(row.id),
        code: row.code,
        name: row.name,
        base: row.base,
        employeeRate: money(row.employee_rate),
        employerRate: money(row.employer_rate),
        deductBeforeTax: flag(row.deduct_before_tax),
        scope: row.scope,
        active: flag(row.active),
      })),
      taxBands: bands.recordset.map((row) => ({
        id: String(row.id),
        from: money(row.band_from),
        to: row.band_to == null ? null : money(row.band_to),
        rate: money(row.rate),
      })),
    },
    profiles: profiles.recordset.map((row) => ({
      employeeId: String(row.employee_id),
      basicSalary: money(row.basic_salary),
      components: profileComponents.get(row.employee_id) ?? [],
      bankId: row.bank_id == null ? "" : String(row.bank_id),
      accountNumber: text(row.account_number),
      contributionIds: profileContributions.get(row.employee_id) ?? [],
    })),
    holds: holds.recordset.map((row) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      fromPeriod: text(row.from_period).slice(0, 7),
      toPeriod: row.to_period ? text(row.to_period).slice(0, 7) : "",
      reason: row.reason,
      createdOn: formatDate(row.created_on),
      releasedOn: formatDate(row.released_on),
    })),
    plans: planRows.recordset.map((row) => ({
      id: row.reference,
      kind: row.kind,
      employeeId: String(row.employee_id),
      category: text(row.category),
      reason: text(row.reason),
      principal: money(row.principal),
      interestRate: money(row.interest_rate),
      total: money(row.total),
      installment: money(row.installment),
      startPeriod: text(row.start_period).slice(0, 7),
      status: row.status,
      requestedOn: formatDate(row.requested_on),
      approvedBy: text(row.approved_by),
      approvedOn: formatDate(row.approved_on),
      disbursedOn: formatDate(row.disbursed_on),
      closedOn: formatDate(row.closed_on),
      closeReason: text(row.close_reason),
      repayments: repaymentMap.get(row.id) ?? [],
    })),
    runs: monthly.recordset.map((row) => ({
      id: String(row.id),
      period: text(row.period).slice(0, 7),
      status: row.status,
      createdOn: "",
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
      contributionColumns: [],
      lines: deductionMap.get(row.id) ?? [],
      excluded: [],
    })),
    midMonthRuns: midRuns.recordset.map((row) => ({
      id: `MM-${text(row.period).slice(0, 7)}`,
      period: text(row.period).slice(0, 7),
      status: row.status,
      basis: "% of basic salary",
      value: 0,
      paymentDate: "",
      createdOn: "",
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
      lines: midLines.recordset
        .filter((line) => line.mid_month_run_id === row.id)
        .map((line) => ({
          employeeId: String(line.employee_id),
          employeeName: "",
          department: "",
          designation: "",
          basicSalary: 0,
          estimatedNet: 0,
          defaultAmount: 0,
          amount: money(line.amount),
          overridden: false,
          bankName: "",
          accountNumber: "",
          warnings: [],
        })),
      excluded: [],
    })),
    overtimeRuns: otRuns.recordset.map((row) => ({
      id: `OT-${text(row.period).slice(0, 7)}`,
      period: text(row.period).slice(0, 7),
      payPeriod: text(row.pay_period).slice(0, 7),
      status: row.status,
      entries: [],
      lines: overtimeByRun.get(row.id) ?? [],
      excluded: [],
      createdOn: "",
      calculatedOn: "",
      approvedBy: "",
      approvedOn: "",
      lockedOn: "",
    })),
    overtimeTypes: overtimeTypes.recordset.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: row.name,
      multiplier: money(row.multiplier),
      taxable: flag(row.taxable),
      active: flag(row.active),
    })),
    overtimeSettings: { standardMonthlyHours: money(hours.recordset[0]?.standard_monthly_hours) },
  };
}

function emptyLine(employeeId: string): PayrollRun["lines"][number] {
  return {
    employeeId,
    employeeName: "",
    department: "",
    designation: "",
    bankName: "",
    accountNumber: "",
    held: false,
    holdReason: "",
    warnings: [],
    basicSalary: 0,
    earnings: [],
    grossPay: 0,
    taxableEarnings: 0,
    contributions: [],
    preTaxDeductions: 0,
    taxableIncome: 0,
    paye: 0,
    deductions: [],
    employeeContributions: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netPay: 0,
    employerContributions: 0,
    employerCost: 0,
  };
}

function monthlyBlock(world: EngineWorld, period: string, kind: "mid" | "overtime") {
  const monthly = world.runs.find((run) => run.period === period);
  if (!monthly || monthly.status === "Draft") {
    return "";
  }
  const status = monthly.status.toLowerCase();
  return kind === "mid"
    ? `The ${formatPeriod(period)} monthly payroll is already ${status}, so this payment could not be deducted from it.`
    : `The ${formatPeriod(period)} monthly payroll is already ${status}, so this overtime could not be paid in it.`;
}

export async function payrollReadinessMessage() {
  const session = await requireCompany();
  if ("error" in session) {
    return session.error;
  }
  const pool = await getPool();
  const world = await loadEngineWorld(session.company.id, pool);
  return validateTaxBands(world.settings.taxBands).length > 0 ? READINESS_MESSAGE : "";
}

async function companySession() {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  return session;
}

export async function listBanks(query: PayrollListQuery) {
  const session = await companySession();
  if ("error" in session) {
    return emptyList() as { rows: { id: number; name: string; code: string; employeeCount: number }[]; totalCount: number };
  }
  const sort = orderBy(query.sortKey, query.sortDirection, { name: "b.name", code: "b.code", employeeCount: "employee_count" }, "b.name");
  const pool = await getPool();
  const search = `%${query.search.trim()}%`;
  const where = `
    FROM dbo.banks AS b
    WHERE b.company_id = @companyId
      AND (@search = N'%%' OR b.name LIKE @search OR b.code LIKE @search)
  `;
  const count = await queryRows<{ total: number }>(pool, `SELECT COUNT(*) AS total ${where}`, session.company.id, search);
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, (query.page - 1) * query.pageSize)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{ id: number; name: string; code: string; employee_count: number }>(`
      SELECT b.id, b.name, b.code,
        (SELECT COUNT(*) FROM dbo.employee_pay_profiles AS p WHERE p.company_id = b.company_id AND p.bank_id = b.id) AS employee_count
      ${where}
      ORDER BY ${sort}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return {
    totalCount: count,
    rows: rows.recordset.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      employeeCount: row.employee_count,
    })),
  };
}

async function queryRows<T extends { total: number }>(pool: sql.ConnectionPool, statement: string, companyId: number, search: string) {
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("search", sql.NVarChar(200), search)
    .query<T>(statement);
  return result.recordset[0]?.total ?? 0;
}

export async function saveBank(values: { id?: number; name: string; code: string }) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const name = values.name.trim();
  const code = values.code.trim().toUpperCase();
  if (!name || !code) {
    return { error: "Bank name and code are required." };
  }
  const pool = await getPool();
  try {
    if (values.id) {
      const result = await pool
        .request()
        .input("id", sql.Int, values.id)
        .input("companyId", sql.Int, session.company.id)
        .input("name", sql.NVarChar(200), name)
        .input("code", sql.NVarChar(50), code)
        .query(`UPDATE dbo.banks SET name = @name, code = @code WHERE id = @id AND company_id = @companyId`);
      if (!result.rowsAffected[0]) {
        return { error: "This bank was not found." };
      }
      return { id: values.id };
    }
    const inserted = await pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("name", sql.NVarChar(200), name)
      .input("code", sql.NVarChar(50), code)
      .query<{ id: number }>(`
        INSERT INTO dbo.banks (company_id, name, code)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, @code)
      `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: "This bank already exists." };
    }
    throw error;
  }
}

export async function deleteBank(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`UPDATE dbo.employee_pay_profiles SET bank_id = NULL WHERE company_id = @companyId AND bank_id = @id`);
    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`DELETE FROM dbo.banks WHERE id = @id AND company_id = @companyId`);
    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "This bank was not found." };
    }
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isForeignKeyError(error)) {
      return { error: IN_USE };
    }
    throw error;
  }
}

export async function listPayComponents(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as PayComponentRow[], totalCount: 0 };
  }
  const sort = orderBy(
    list.sortKey,
    list.sortDirection,
    {
      code: "c.code",
      name: "c.name",
      type: "c.type",
      calculation: "c.calculation",
      defaultValue: "c.default_value",
      active: "c.active",
    },
    "c.code",
  );
  const pool = await getPool();
  const search = `%${list.search.trim()}%`;
  const where = `
    FROM dbo.pay_components AS c
    WHERE c.company_id = @companyId
      AND (@search = N'%%' OR c.code LIKE @search OR c.name LIKE @search OR c.type LIKE @search)
  `;
  const totalCount = await queryRows<{ total: number }>(pool, `SELECT COUNT(*) AS total ${where}`, session.company.id, search);
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, (list.page - 1) * list.pageSize)
    .input("pageSize", sql.Int, list.pageSize)
    .query<ComponentSql>(`
      SELECT c.id, c.code, c.name, c.type, c.calculation, c.default_value, c.taxable, c.active,
        (SELECT COUNT(*) FROM dbo.employee_pay_components AS a WHERE a.company_id = c.company_id AND a.pay_component_id = c.id) AS assignment_count
      ${where}
      ORDER BY ${sort}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return { totalCount, rows: rows.recordset.map(mapComponent) };
}

type ComponentSql = {
  id: number;
  code: string;
  name: string;
  type: PayComponentType;
  calculation: PayComponentCalculation;
  default_value: number;
  taxable: boolean;
  active: boolean;
  assignment_count?: number;
};

export type PayComponentRow = PayComponent & { assignmentCount: number };

function mapComponent(row: ComponentSql): PayComponentRow {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    type: row.type,
    calculation: row.calculation,
    defaultValue: money(row.default_value),
    taxable: flag(row.taxable),
    active: flag(row.active),
    assignmentCount: row.assignment_count ?? 0,
  };
}

export async function savePayComponent(values: {
  id?: number;
  code: string;
  name: string;
  type: PayComponentType;
  calculation: PayComponentCalculation;
  defaultValue: number;
  taxable: boolean;
  active: boolean;
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const code = values.code.trim().toUpperCase();
  const name = values.name.trim();
  if (!code || !name) {
    return { error: "Code and name are required." };
  }
  if (!Number.isFinite(values.defaultValue) || values.defaultValue < 0) {
    return { error: "Default value must be a number of 0 or more." };
  }
  if (values.calculation === "% of basic salary" && values.defaultValue > 100) {
    return { error: "A percentage cannot be more than 100." };
  }
  const taxable = values.type === "Earning" ? values.taxable : false;
  const pool = await getPool();
  try {
    const request = pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("code", sql.NVarChar(50), code)
      .input("name", sql.NVarChar(200), name)
      .input("type", sql.NVarChar(20), values.type)
      .input("calculation", sql.NVarChar(30), values.calculation)
      .input("defaultValue", sql.Decimal(18, 2), values.defaultValue)
      .input("taxable", sql.Bit, taxable)
      .input("active", sql.Bit, values.active);
    if (values.id) {
      const result = await request
        .input("id", sql.Int, values.id)
        .query(`
          UPDATE dbo.pay_components
          SET code = @code, name = @name, type = @type, calculation = @calculation,
              default_value = @defaultValue, taxable = @taxable, active = @active
          WHERE id = @id AND company_id = @companyId
        `);
      if (!result.rowsAffected[0]) {
        return { error: "This pay component was not found." };
      }
      return { id: values.id };
    }
    const inserted = await request.query<{ id: number }>(`
      INSERT INTO dbo.pay_components (company_id, code, name, type, calculation, default_value, taxable, active)
      OUTPUT INSERTED.id
      VALUES (@companyId, @code, @name, @type, @calculation, @defaultValue, @taxable, @active)
    `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: `Another component already uses the code ${code}.` };
    }
    throw error;
  }
}

export async function deletePayComponent(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`DELETE FROM dbo.pay_components WHERE id = @id AND company_id = @companyId`);
    if (!result.rowsAffected[0]) {
      return { error: "This pay component was not found." };
    }
    return { id };
  } catch (error) {
    if (isForeignKeyError(error)) {
      return { error: IN_USE };
    }
    throw error;
  }
}

export async function listContributions(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as StatutoryContribution[], totalCount: 0 };
  }
  const sort = orderBy(
    list.sortKey,
    list.sortDirection,
    { code: "c.code", name: "c.name", base: "c.base", employeeRate: "c.employee_rate", employerRate: "c.employer_rate", scope: "c.scope", active: "c.active" },
    "c.code",
  );
  const pool = await getPool();
  const search = `%${list.search.trim()}%`;
  const where = `
    FROM dbo.statutory_contributions AS c
    WHERE c.company_id = @companyId
      AND (@search = N'%%' OR c.code LIKE @search OR c.name LIKE @search)
  `;
  const totalCount = await queryRows<{ total: number }>(pool, `SELECT COUNT(*) AS total ${where}`, session.company.id, search);
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, (list.page - 1) * list.pageSize)
    .input("pageSize", sql.Int, list.pageSize)
    .query<{
      id: number;
      code: string;
      name: string;
      base: ContributionBase;
      employee_rate: number;
      employer_rate: number;
      deduct_before_tax: boolean;
      scope: ContributionScope;
      active: boolean;
    }>(`
      SELECT c.id, c.code, c.name, c.base, c.employee_rate, c.employer_rate, c.deduct_before_tax, c.scope, c.active
      ${where}
      ORDER BY ${sort}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return {
    totalCount,
    rows: rows.recordset.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: row.name,
      base: row.base,
      employeeRate: money(row.employee_rate),
      employerRate: money(row.employer_rate),
      deductBeforeTax: flag(row.deduct_before_tax),
      scope: row.scope,
      active: flag(row.active),
    })),
  };
}

export async function saveContribution(values: {
  id?: number;
  code: string;
  name: string;
  base: ContributionBase;
  employeeRate: number;
  employerRate: number;
  deductBeforeTax: boolean;
  scope: ContributionScope;
  active: boolean;
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const code = values.code.trim().toUpperCase();
  const name = values.name.trim();
  if (!code || !name) {
    return { error: "Code and name are required." };
  }
  if (!Number.isFinite(values.employeeRate) || values.employeeRate < 0 || values.employeeRate > 100) {
    return { error: "Employee rate must be between 0 and 100." };
  }
  if (!Number.isFinite(values.employerRate) || values.employerRate < 0 || values.employerRate > 100) {
    return { error: "Employer rate must be between 0 and 100." };
  }
  if (values.employeeRate === 0 && values.employerRate === 0) {
    return { error: "Set an employee rate, an employer rate, or both." };
  }
  const pool = await getPool();
  try {
    const request = pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("code", sql.NVarChar(50), code)
      .input("name", sql.NVarChar(200), name)
      .input("base", sql.NVarChar(20), values.base)
      .input("employeeRate", sql.Decimal(8, 4), values.employeeRate)
      .input("employerRate", sql.Decimal(8, 4), values.employerRate)
      .input("deductBeforeTax", sql.Bit, values.deductBeforeTax)
      .input("scope", sql.NVarChar(30), values.scope)
      .input("active", sql.Bit, values.active);
    if (values.id) {
      const result = await request.input("id", sql.Int, values.id).query(`
        UPDATE dbo.statutory_contributions
        SET code = @code, name = @name, base = @base, employee_rate = @employeeRate,
            employer_rate = @employerRate, deduct_before_tax = @deductBeforeTax, scope = @scope, active = @active
        WHERE id = @id AND company_id = @companyId
      `);
      if (!result.rowsAffected[0]) {
        return { error: "This contribution was not found." };
      }
      return { id: values.id };
    }
    const inserted = await request.query<{ id: number }>(`
      INSERT INTO dbo.statutory_contributions
        (company_id, code, name, base, employee_rate, employer_rate, deduct_before_tax, scope, active)
      OUTPUT INSERTED.id
      VALUES (@companyId, @code, @name, @base, @employeeRate, @employerRate, @deductBeforeTax, @scope, @active)
    `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: `Another contribution already uses the code ${code}.` };
    }
    throw error;
  }
}

export async function deleteContribution(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`DELETE FROM dbo.statutory_contributions WHERE id = @id AND company_id = @companyId`);
    if (!result.rowsAffected[0]) {
      return { error: "This contribution was not found." };
    }
    return { id };
  } catch (error) {
    if (isForeignKeyError(error)) {
      return { error: IN_USE };
    }
    throw error;
  }
}

export async function listTaxBands() {
  const session = await requireCompany();
  if ("error" in session) {
    return [] as TaxBand[];
  }
  const pool = await getPool();
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .query<{ id: number; band_from: number; band_to: number | null; rate: number }>(`
      SELECT id, band_from, band_to, rate
      FROM dbo.tax_bands
      WHERE company_id = @companyId
      ORDER BY sort_order, id
    `);
  return rows.recordset.map((row) => ({
    id: String(row.id),
    from: money(row.band_from),
    to: row.band_to == null ? null : money(row.band_to),
    rate: money(row.rate),
  }));
}

export async function saveTaxBands(bands: Omit<TaxBand, "id">[]) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const draft = bands.map((band, index) => ({ ...band, id: String(index) }));
  const problem = validateTaxBands(draft)[0];
  if (problem) {
    return { error: problem };
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .query(`DELETE FROM dbo.tax_bands WHERE company_id = @companyId`);
    for (let index = 0; index < draft.length; index += 1) {
      const band = draft[index];
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("bandFrom", sql.Decimal(18, 2), band.from)
        .input("bandTo", sql.Decimal(18, 2), band.to)
        .input("rate", sql.Decimal(8, 4), band.rate)
        .input("sortOrder", sql.Int, index)
        .query(`
          INSERT INTO dbo.tax_bands (company_id, band_from, band_to, rate, sort_order)
          VALUES (@companyId, @bandFrom, @bandTo, @rate, @sortOrder)
        `);
    }
    await transaction.commit();
    return { ok: true as const };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
