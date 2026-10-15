import "server-only";
import {
  planBalance,
  planDisplayStatus,
  planInstallmentForPeriod,
  loanTotal,
} from "@/components/payroll/deduction-plans";
import { buildMidMonthLines, midMonthWarnings } from "@/components/payroll/mid-month";
import { buildOvertimeLines, overtimeReadiness } from "@/components/payroll/overtime";
import { calculateEmployeePay, validateTaxBands } from "@/components/payroll/payroll-engine";
import { periodAdjustments } from "@/components/payroll/payroll-inputs";
import {
  buildPayrollRunLines,
  formatPeriod,
  isHoldActive,
  payrollTotals,
} from "@/components/payroll/payroll-run-builder";
import type {
  DeductionPlan,
  DeductionPlanKind,
  MidMonthBasis,
  MidMonthRun,
  OvertimeEntry,
  OvertimeRun,
  PayrollListQuery,
  PayrollRun,
  PayrollRunStatus,
} from "@/components/payroll/payroll.types";
import { getPool, sql } from "./db";
import { loadEngineWorld, type EngineWorld } from "./payroll";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

const READINESS =
  "PAYE tax bands are not configured. Set them up in Settings → Tax bands before running payroll.";
const IN_USE = "This record is in use.";
const NO_SALARY = "No basic salary set in Component assignment";

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

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

async function worldForSession() {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  return { session, pool, world: await loadEngineWorld(session.company.id, pool) };
}

function monthlyStatus(world: EngineWorld, period: string) {
  return world.runs.find((run) => run.period === period)?.status ?? "";
}

function monthlyBlocked(world: EngineWorld, period: string, kind: "mid" | "overtime") {
  const status = monthlyStatus(world, period);
  if (!status || status === "Draft") {
    return "";
  }
  const label = status.toLowerCase();
  return kind === "mid"
    ? `The ${formatPeriod(period)} monthly payroll is already ${label}, so this payment could not be deducted from it.`
    : `The ${formatPeriod(period)} monthly payroll is already ${label}, so this overtime could not be paid in it.`;
}

function planReference(kind: DeductionPlanKind, id: number) {
  const prefix = kind === "Loan" ? "LN-" : kind === "Advance" ? "ADV-" : "REC-";
  return `${prefix}${id < 10000 ? String(id).padStart(4, "0") : String(id)}`;
}

export async function listOvertimeSettings(list: PayrollListQuery) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return { rows: [], totalCount: 0, standardMonthlyHours: 0 };
  }
  const search = list.search.trim().toLowerCase();
  let rows = loaded.world.overtimeTypes.filter(
    (row) => !search || row.code.toLowerCase().includes(search) || row.name.toLowerCase().includes(search),
  );
  const columns: Record<string, (row: (typeof rows)[number]) => string | number> = {
    code: (row) => row.code,
    name: (row) => row.name,
    multiplier: (row) => row.multiplier,
    active: (row) => (row.active ? 1 : 0),
  };
  const pick = columns[list.sortKey];
  if (pick) {
    rows = [...rows].sort((a, b) => {
      const left = pick(a);
      const right = pick(b);
      const compared = left < right ? -1 : left > right ? 1 : 0;
      return list.sortDirection === "desc" ? -compared : compared;
    });
  } else {
    rows = [...rows].sort((a, b) => a.code.localeCompare(b.code));
  }
  const start = (list.page - 1) * list.pageSize;
  return {
    totalCount: rows.length,
    standardMonthlyHours: loaded.world.overtimeSettings.standardMonthlyHours,
    rows: rows.slice(start, start + list.pageSize),
  };
}

export async function saveOvertimeType(values: {
  id?: number;
  code: string;
  name: string;
  multiplier: number;
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
  if (!(values.multiplier > 0)) {
    return { error: "Enter a multiplier greater than 0, for example 1.5." };
  }
  const pool = await getPool();
  try {
    const request = pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("code", sql.NVarChar(50), code)
      .input("name", sql.NVarChar(200), name)
      .input("multiplier", sql.Decimal(8, 4), values.multiplier)
      .input("taxable", sql.Bit, values.taxable)
      .input("active", sql.Bit, values.active);
    if (values.id) {
      const result = await request.input("id", sql.Int, values.id).query(`
        UPDATE dbo.overtime_types
        SET code = @code, name = @name, multiplier = @multiplier, taxable = @taxable, active = @active
        WHERE id = @id AND company_id = @companyId
      `);
      if (!result.rowsAffected[0]) {
        return { error: "This overtime rate was not found." };
      }
      return { id: values.id };
    }
    const inserted = await request.query<{ id: number }>(`
      INSERT INTO dbo.overtime_types (company_id, code, name, multiplier, taxable, active)
      OUTPUT INSERTED.id
      VALUES (@companyId, @code, @name, @multiplier, @taxable, @active)
    `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (errorNumber(error) === 2627 || errorNumber(error) === 2601) {
      return { error: "This code is already used." };
    }
    throw error;
  }
}

export async function deleteOvertimeType(id: number) {
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
      .query(`DELETE FROM dbo.overtime_types WHERE id = @id AND company_id = @companyId`);
    if (!result.rowsAffected[0]) {
      return { error: "This overtime rate was not found." };
    }
    return { id };
  } catch (error) {
    if (errorNumber(error) === 547) {
      return { error: IN_USE };
    }
    throw error;
  }
}

export async function saveOvertimeHours(hours: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  if (!Number.isFinite(hours) || hours < 0) {
    return { error: "Standard working hours must be 0 or more." };
  }
  const pool = await getPool();
  await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("hours", sql.Decimal(8, 2), hours)
    .query(`
      MERGE dbo.overtime_settings AS target
      USING (SELECT @companyId AS company_id) AS source
      ON target.company_id = source.company_id
      WHEN MATCHED THEN UPDATE SET standard_monthly_hours = @hours
      WHEN NOT MATCHED THEN INSERT (company_id, standard_monthly_hours) VALUES (@companyId, @hours);
    `);
  return { ok: true as const };
}

export async function listPayAssignments(list: PayrollListQuery) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return { rows: [], totalCount: 0 };
  }
  const { world } = loaded;
  const search = list.search.trim().toLowerCase();
  const status = list.status;
  let rows = world.employees
    .filter((employee) => !status || employee.status === status)
    .map((employee) => {
      const profile = world.profiles.find((item) => item.employeeId === employee.id);
      const pay = profile ? calculateEmployeePay(profile, world.settings) : null;
      const code = world.employeeCodes.get(employee.id) ?? "";
      const name = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ");
      return {
        id: Number(employee.id),
        employeeCode: code,
        name,
        department: employee.department,
        status: employee.status,
        basicSalary: profile?.basicSalary ?? 0,
        componentCount: profile?.components.length ?? 0,
        grossPay: pay?.grossPay ?? 0,
        bank: world.banks.find((bank) => bank.id === profile?.bankId)?.name ?? "",
      };
    })
    .filter(
      (row) =>
        !search ||
        row.name.toLowerCase().includes(search) ||
        row.employeeCode.toLowerCase().includes(search),
    );
  const columns: Record<string, (row: (typeof rows)[number]) => string | number> = {
    name: (row) => row.name,
    employeeCode: (row) => row.employeeCode,
    department: (row) => row.department,
    status: (row) => row.status,
    basicSalary: (row) => row.basicSalary,
    componentCount: (row) => row.componentCount,
    grossPay: (row) => row.grossPay,
    bank: (row) => row.bank,
  };
  const pick = columns[list.sortKey] ?? columns.name;
  rows = [...rows].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    const compared = left < right ? -1 : left > right ? 1 : 0;
    return list.sortDirection === "desc" ? -compared : compared;
  });
  const start = (list.page - 1) * list.pageSize;
  return { totalCount: rows.length, rows: rows.slice(start, start + list.pageSize) };
}

export async function getPayAssignment(employeeId: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const employee = loaded.world.employees.find((item) => item.id === String(employeeId));
  if (!employee) {
    return { error: "This employee was not found." };
  }
  const profile = loaded.world.profiles.find((item) => item.employeeId === String(employeeId));
  return {
    employeeId,
    employeeCode: loaded.world.employeeCodes.get(String(employeeId)) ?? "",
    name: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
    basicSalary: profile?.basicSalary ?? 0,
    bankId: profile?.bankId ?? "",
    accountNumber: profile?.accountNumber ?? "",
    components: profile?.components ?? [],
    contributionIds: profile?.contributionIds ?? [],
    catalog: {
      components: loaded.world.settings.components,
      contributions: loaded.world.settings.contributions.filter((item) => item.scope === "Selected employees"),
      banks: loaded.world.banks,
      taxBands: loaded.world.settings.taxBands,
      allContributions: loaded.world.settings.contributions,
    },
  };
}

export async function savePayAssignment(values: {
  employeeId: number;
  basicSalary: number;
  bankId: string;
  accountNumber: string;
  components: { componentId: string; value: number }[];
  contributionIds: string[];
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  if (!Number.isFinite(values.basicSalary) || values.basicSalary < 0) {
    return { error: "Basic salary must be 0 or more." };
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const employee = await new sql.Request(transaction)
      .input("id", sql.Int, values.employeeId)
      .input("companyId", sql.Int, session.company.id)
      .query(`SELECT id FROM dbo.employees WHERE id = @id AND company_id = @companyId`);
    if (!employee.recordset.length) {
      await transaction.rollback();
      return { error: "This employee was not found." };
    }
    const bankId = values.bankId ? Number(values.bankId) : null;
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, values.employeeId)
      .input("basic", sql.Decimal(18, 2), values.basicSalary)
      .input("bankId", sql.Int, bankId)
      .input("account", sql.NVarChar(50), values.accountNumber.trim())
      .query(`
        MERGE dbo.employee_pay_profiles AS target
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id) AS source
        ON target.company_id = source.company_id AND target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET basic_salary = @basic, bank_id = @bankId, account_number = @account
        WHEN NOT MATCHED THEN
          INSERT (company_id, employee_id, basic_salary, bank_id, account_number)
          VALUES (@companyId, @employeeId, @basic, @bankId, @account);
      `);
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, values.employeeId)
      .query(`DELETE FROM dbo.employee_pay_components WHERE company_id = @companyId AND employee_id = @employeeId`);
    for (const component of values.components) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("employeeId", sql.Int, values.employeeId)
        .input("componentId", sql.Int, Number(component.componentId))
        .input("value", sql.Decimal(18, 2), component.value)
        .query(`
          INSERT INTO dbo.employee_pay_components (company_id, employee_id, pay_component_id, value)
          VALUES (@companyId, @employeeId, @componentId, @value)
        `);
    }
    await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, values.employeeId)
      .query(`DELETE FROM dbo.employee_pay_contributions WHERE company_id = @companyId AND employee_id = @employeeId`);
    for (const contributionId of values.contributionIds) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("employeeId", sql.Int, values.employeeId)
        .input("contributionId", sql.Int, Number(contributionId))
        .query(`
          INSERT INTO dbo.employee_pay_contributions (company_id, employee_id, statutory_contribution_id)
          VALUES (@companyId, @employeeId, @contributionId)
        `);
    }
    await transaction.commit();
    return { id: values.employeeId };
  } catch (error) {
    await transaction.rollback();
    if (errorNumber(error) === 547) {
      return { error: IN_USE };
    }
    throw error;
  }
}

const HOLD_NAME = `LTRIM(RTRIM(CONCAT(e.first_name, N' ', CASE WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N'' ELSE e.middle_name + N' ' END, e.last_name)))`;

export async function listSalaryHolds(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0 };
  }
  const sort = orderBy(
    list.sortKey,
    list.sortDirection,
    {
      employeeName: HOLD_NAME,
      employeeCode: "e.employee_code",
      fromPeriod: "h.from_period",
      toPeriod: "h.to_period",
      reason: "h.reason",
      createdOn: "h.created_on",
      holdStatus: "h.released_on",
    },
    "h.id DESC",
  );
  const direction = list.sortKey ? "" : "";
  const pool = await getPool();
  const search = `%${list.search.trim()}%`;
  const where = `
    FROM dbo.salary_holds AS h
    INNER JOIN dbo.employees AS e ON e.id = h.employee_id AND e.company_id = h.company_id
    WHERE h.company_id = @companyId
      AND (@search = N'%%' OR ${HOLD_NAME} LIKE @search OR e.employee_code LIKE @search OR h.reason LIKE @search)
  `;
  const count = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<{ total: number }>(`SELECT COUNT(*) AS total ${where}`);
  const order = list.sortKey ? sort : "h.id DESC";
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, (list.page - 1) * list.pageSize)
    .input("pageSize", sql.Int, list.pageSize)
    .query<{
      id: number;
      employee_id: number;
      employee_code: string;
      employee_name: string;
      from_period: string;
      to_period: string | null;
      reason: string;
      created_on: Date;
      released_on: Date | null;
    }>(`
      SELECT h.id, h.employee_id, e.employee_code, ${HOLD_NAME} AS employee_name,
             h.from_period, h.to_period, h.reason, h.created_on, h.released_on
      ${where}
      ORDER BY ${order}${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  const period = todayIso().slice(0, 7);
  return {
    totalCount: count.recordset[0]?.total ?? 0,
    rows: rows.recordset.map((row) => {
      const hold = {
        id: String(row.id),
        employeeId: String(row.employee_id),
        fromPeriod: text(row.from_period).slice(0, 7),
        toPeriod: row.to_period ? text(row.to_period).slice(0, 7) : "",
        reason: row.reason,
        createdOn: formatDate(row.created_on),
        releasedOn: formatDate(row.released_on),
      };
      const holdStatus = hold.releasedOn
        ? "Released"
        : isHoldActive(hold, period)
          ? "Active"
          : hold.fromPeriod > period
            ? "Scheduled"
            : "Ended";
      return { ...hold, employeeName: row.employee_name, employeeCode: row.employee_code, holdStatus };
    }),
  };
}

export async function listHoldEmployees(includeId?: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return [];
  }
  const pool = await getPool();
  const rows = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("includeId", sql.Int, includeId ?? 0)
    .query<{ id: number; employee_code: string; name: string }>(`
      SELECT e.id, e.employee_code, ${HOLD_NAME} AS name
      FROM dbo.employees AS e
      WHERE e.company_id = @companyId
        AND (e.status = N'Active' OR e.id = @includeId)
      ORDER BY e.first_name, e.last_name
    `);
  return rows.recordset;
}

export async function saveSalaryHold(values: {
  id?: number;
  employeeId: number;
  fromPeriod: string;
  toPeriod: string;
  reason: string;
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const reason = values.reason.trim();
  if (!values.employeeId || !validPeriod(values.fromPeriod) || !reason) {
    return { error: "Employee, start month and reason are required." };
  }
  if (values.toPeriod && (!validPeriod(values.toPeriod) || values.toPeriod < values.fromPeriod)) {
    return { error: "The end month cannot be before the start month." };
  }
  const pool = await getPool();
  const overlap = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, values.employeeId)
    .input("id", sql.Int, values.id ?? 0)
    .input("fromPeriod", sql.Char(7), values.fromPeriod)
    .input("toPeriod", sql.Char(7), values.toPeriod || null)
    .query(`
      SELECT h.id
      FROM dbo.salary_holds AS h
      WHERE h.company_id = @companyId
        AND h.employee_id = @employeeId
        AND h.released_on IS NULL
        AND h.id <> @id
        AND (h.to_period IS NULL OR h.to_period >= @fromPeriod)
        AND (@toPeriod IS NULL OR @toPeriod >= h.from_period)
    `);
  if (overlap.recordset.length) {
    return { error: "This employee already has a hold covering these months." };
  }
  if (values.id) {
    const result = await pool
      .request()
      .input("id", sql.Int, values.id)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, values.employeeId)
      .input("fromPeriod", sql.Char(7), values.fromPeriod)
      .input("toPeriod", sql.Char(7), values.toPeriod || null)
      .input("reason", sql.NVarChar(500), reason)
      .query(`
        UPDATE dbo.salary_holds
        SET employee_id = @employeeId, from_period = @fromPeriod, to_period = @toPeriod, reason = @reason
        WHERE id = @id AND company_id = @companyId AND released_on IS NULL
      `);
    if (!result.rowsAffected[0]) {
      return { error: "This salary hold was not found." };
    }
    return { id: values.id };
  }
  const inserted = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, values.employeeId)
    .input("fromPeriod", sql.Char(7), values.fromPeriod)
    .input("toPeriod", sql.Char(7), values.toPeriod || null)
    .input("reason", sql.NVarChar(500), reason)
    .input("createdOn", sql.Date, todayIso())
    .query<{ id: number }>(`
      INSERT INTO dbo.salary_holds (company_id, employee_id, from_period, to_period, reason, created_on)
      OUTPUT INSERTED.id
      VALUES (@companyId, @employeeId, @fromPeriod, @toPeriod, @reason, @createdOn)
    `);
  return { id: inserted.recordset[0].id };
}

export async function releaseSalaryHold(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("releasedOn", sql.Date, todayIso())
    .query(`
      UPDATE dbo.salary_holds
      SET released_on = @releasedOn
      WHERE id = @id AND company_id = @companyId AND released_on IS NULL
    `);
  if (!result.rowsAffected[0]) {
    return { error: "This salary hold was not found." };
  }
  return { id };
}

export async function deleteSalaryHold(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query(`DELETE FROM dbo.salary_holds WHERE id = @id AND company_id = @companyId AND released_on IS NULL`);
  if (!result.rowsAffected[0]) {
    return { error: "This salary hold was not found." };
  }
  return { id };
}

function findPlan(world: EngineWorld, id: number) {
  return world.plans.find((plan) => {
    const numeric = Number(plan.id.replace(/\D/g, ""));
    return numeric === id;
  });
}

export async function listDeductionPlans(kind: DeductionPlanKind, list: PayrollListQuery) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return {
      rows: [],
      totalCount: 0,
      awaiting: 0,
      paused: 0,
      running: 0,
      completed: 0,
      outstanding: 0,
      dueNext: 0,
      nextPeriod: todayIso().slice(0, 7),
    };
  }
  const { world } = loaded;
  let period = todayIso().slice(0, 7);
  while (world.runs.some((run) => run.period === period && run.status !== "Draft")) {
    const [year, month] = period.split("-").map(Number);
    const date = new Date(Date.UTC(year, month, 1));
    period = date.toISOString().slice(0, 7);
  }
  const search = list.search.trim().toLowerCase();
  const all = world.plans
    .filter((plan) => plan.kind === kind)
    .map((plan) => {
      const balance = planBalance(plan, world.runs);
      const employee = world.employees.find((item) => item.id === plan.employeeId);
      const numeric = Number(plan.id.replace(/\D/g, ""));
      return {
        id: numeric,
        reference: plan.id,
        employeeId: Number(plan.employeeId),
        employeeCode: world.employeeCodes.get(plan.employeeId) ?? "",
        employeeName: employee
          ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")
          : plan.employeeId,
        category: plan.category,
        reason: plan.reason,
        principal: plan.principal,
        interestRate: plan.interestRate,
        total: plan.total,
        installment: plan.installment,
        startPeriod: plan.startPeriod,
        status: plan.status,
        displayStatus: planDisplayStatus(plan, world.runs),
        recovered: balance.recoveredPayroll + balance.repaidManually,
        outstanding: balance.outstanding,
        requestedOn: plan.requestedOn,
        plan,
      };
    });
  const live = all.filter((row) => row.displayStatus === "Active" || row.displayStatus === "Paused");
  const dueNext = world.plans
    .filter((plan) => plan.kind === kind)
    .reduce((sum, plan) => sum + planInstallmentForPeriod(plan, period, world.runs), 0);
  let rows = all.filter((row) => {
    const matchesSearch =
      !search ||
      row.reference.toLowerCase().includes(search) ||
      row.employeeName.toLowerCase().includes(search) ||
      row.employeeCode.toLowerCase().includes(search) ||
      row.category.toLowerCase().includes(search) ||
      row.reason.toLowerCase().includes(search);
    const matchesStatus = !list.status || row.displayStatus === list.status;
    return matchesSearch && matchesStatus;
  });
  const columns: Record<string, (row: (typeof rows)[number]) => string | number> = {
    reference: (row) => row.reference,
    employeeCode: (row) => row.employeeCode,
    employeeName: (row) => row.employeeName,
    category: (row) => row.category,
    total: (row) => row.total,
    installment: (row) => row.installment,
    startPeriod: (row) => row.startPeriod,
    recovered: (row) => row.recovered,
    outstanding: (row) => row.outstanding,
    displayStatus: (row) => row.displayStatus,
  };
  const pick = columns[list.sortKey];
  rows = [...rows].sort((a, b) => {
    if (!pick) {
      return b.id - a.id;
    }
    const left = pick(a);
    const right = pick(b);
    const compared = left < right ? -1 : left > right ? 1 : 0;
    return list.sortDirection === "desc" ? -compared : compared;
  });
  const start = (list.page - 1) * list.pageSize;
  return {
    totalCount: rows.length,
    rows: rows.slice(start, start + list.pageSize).map(({ plan: _plan, ...row }) => row),
    awaiting: all.filter((row) => row.displayStatus === "Pending").length,
    paused: all.filter((row) => row.displayStatus === "Paused").length,
    running: live.length,
    completed: all.filter((row) => row.displayStatus === "Completed").length,
    outstanding: live.reduce((sum, row) => sum + row.outstanding, 0),
    dueNext,
    nextPeriod: period,
  };
}

export async function getDeductionPlan(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const plan = findPlan(loaded.world, id);
  if (!plan) {
    return { error: "This record was not found." };
  }
  const balance = planBalance(plan, loaded.world.runs);
  const employee = loaded.world.employees.find((item) => item.id === plan.employeeId);
  return {
    plan,
    numericId: id,
    balance,
    displayStatus: planDisplayStatus(plan, loaded.world.runs),
    employeeName: employee
      ? [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ")
      : "",
    employeeCode: loaded.world.employeeCodes.get(plan.employeeId) ?? "",
    runs: loaded.world.runs,
    canDelete:
      plan.repayments.length === 0 &&
      loaded.world.runs.every(
        (run) => !run.lines.some((line) => line.deductions.some((item) => item.componentId === plan.id)),
      ),
  };
}

export async function saveDeductionPlan(values: {
  id?: number;
  kind: DeductionPlanKind;
  employeeId: number;
  category: string;
  reason: string;
  principal: number;
  interestRate: number;
  installment: number;
  startPeriod: string;
}) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const { world, session, pool } = loaded;
  if (!values.employeeId) {
    return { error: "Choose an employee." };
  }
  if (!(values.principal > 0)) {
    return { error: "Enter an amount greater than 0." };
  }
  const interest = values.kind === "Loan" ? values.interestRate : 0;
  if (interest < 0) {
    return { error: "Interest cannot be negative." };
  }
  const total = values.kind === "Loan" ? loanTotal(values.principal, interest) : values.principal;
  if (!(values.installment > 0)) {
    return { error: "Enter a monthly deduction greater than 0." };
  }
  if (values.installment > total) {
    return { error: "The monthly deduction cannot be more than the total to recover." };
  }
  if (!validPeriod(values.startPeriod)) {
    return { error: "Choose the first deduction month." };
  }
  const existing = values.id ? findPlan(world, values.id) : undefined;
  const lockedStart = world.runs.find((run) => run.period === values.startPeriod && run.status !== "Draft");
  if (lockedStart && values.startPeriod !== existing?.startPeriod) {
    return {
      error: `The ${formatPeriod(values.startPeriod)} payroll is already ${lockedStart.status.toLowerCase()}. Start from a later month.`,
    };
  }
  if (existing) {
    const balance = planBalance(existing, world.runs);
    const recovered = balance.recoveredPayroll + balance.pendingPayroll + balance.repaidManually;
    if (total < recovered) {
      return { error: `The total cannot be less than the ${recovered} already recovered.` };
    }
    const result = await pool
      .request()
      .input("id", sql.Int, values.id)
      .input("companyId", sql.Int, session.company.id)
      .input("category", sql.NVarChar(200), values.category.trim())
      .input("reason", sql.NVarChar(1000), values.reason.trim())
      .input("principal", sql.Decimal(18, 2), values.principal)
      .input("interest", sql.Decimal(8, 4), interest)
      .input("total", sql.Decimal(18, 2), total)
      .input("installment", sql.Decimal(18, 2), values.installment)
      .input("startPeriod", sql.Char(7), values.startPeriod)
      .query(`
        UPDATE dbo.deduction_plans
        SET category = @category, reason = @reason, principal = @principal, interest_rate = @interest,
            total = @total, installment = @installment, start_period = @startPeriod
        WHERE id = @id AND company_id = @companyId
          AND status IN (N'Pending', N'Active', N'Paused')
      `);
    if (!result.rowsAffected[0]) {
      return { error: "This record was not found." };
    }
    return { id: values.id! };
  }
  const inserted = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("kind", sql.NVarChar(20), values.kind)
    .input("employeeId", sql.Int, values.employeeId)
    .input("category", sql.NVarChar(200), values.category.trim())
    .input("reason", sql.NVarChar(1000), values.reason.trim())
    .input("principal", sql.Decimal(18, 2), values.principal)
    .input("interest", sql.Decimal(8, 4), interest)
    .input("total", sql.Decimal(18, 2), total)
    .input("installment", sql.Decimal(18, 2), values.installment)
    .input("startPeriod", sql.Char(7), values.startPeriod)
    .input("status", sql.NVarChar(20), values.kind === "Recovery" ? "Active" : "Pending")
    .input("requestedOn", sql.Date, todayIso())
    .query<{ id: number }>(`
      INSERT INTO dbo.deduction_plans (
        company_id, kind, employee_id, category, reason, principal, interest_rate, total,
        installment, start_period, status, requested_on
      )
      OUTPUT INSERTED.id
      VALUES (
        @companyId, @kind, @employeeId, @category, @reason, @principal, @interest, @total,
        @installment, @startPeriod, @status, @requestedOn
      )
    `);
  return { id: inserted.recordset[0].id };
}

async function updatePlanStatus(
  id: number,
  from: string,
  status: string,
  extra: string,
  inputs: (request: sql.Request) => void,
) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const request = pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("status", sql.NVarChar(20), status);
  inputs(request);
  const result = await request.query(`
    UPDATE dbo.deduction_plans
    SET status = @status${extra}
    WHERE id = @id AND company_id = @companyId AND status = N'${from}'
  `);
  if (!result.rowsAffected[0]) {
    return { error: "This record was not found." };
  }
  return { id };
}

export async function approveDeductionPlan(id: number, approvedBy: string, disbursedOn: string) {
  const name = approvedBy.trim();
  if (!name) {
    return { error: "Enter the approver's name." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(disbursedOn)) {
    return { error: "Choose the date the money was paid." };
  }
  return updatePlanStatus(id, "Pending", "Active", ", approved_by = @approvedBy, approved_on = @approvedOn, disbursed_on = @disbursedOn", (request) => {
    request.input("approvedBy", sql.NVarChar(200), name);
    request.input("approvedOn", sql.Date, todayIso());
    request.input("disbursedOn", sql.Date, disbursedOn);
  });
}

export async function rejectDeductionPlan(id: number, reason: string) {
  const comment = reason.trim();
  if (!comment) {
    return { error: "Add a comment explaining the rejection." };
  }
  return updatePlanStatus(id, "Pending", "Rejected", ", closed_on = @closedOn, close_reason = @reason", (request) => {
    request.input("closedOn", sql.Date, todayIso());
    request.input("reason", sql.NVarChar(1000), comment);
  });
}

export async function pauseDeductionPlan(id: number) {
  return updatePlanStatus(id, "Active", "Paused", "", () => undefined);
}

export async function resumeDeductionPlan(id: number) {
  return updatePlanStatus(id, "Paused", "Active", "", () => undefined);
}

export async function closeDeductionPlan(id: number, reason: string) {
  const comment = reason.trim();
  if (!comment) {
    return { error: "Add a reason for closing this record." };
  }
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("closedOn", sql.Date, todayIso())
    .input("reason", sql.NVarChar(1000), comment)
    .query(`
      UPDATE dbo.deduction_plans
      SET status = N'Closed', closed_on = @closedOn, close_reason = @reason
      WHERE id = @id AND company_id = @companyId AND status IN (N'Active', N'Paused', N'Pending')
    `);
  if (!result.rowsAffected[0]) {
    return { error: "This record was not found." };
  }
  return { id };
}

export async function addPlanRepayment(id: number, amount: number, date: string, note: string) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const plan = findPlan(loaded.world, id);
  if (!plan) {
    return { error: "This record no longer exists." };
  }
  const balance = planBalance(plan, loaded.world.runs);
  const open = Math.round((balance.outstanding - balance.pendingPayroll) * 100) / 100;
  if (!(amount > 0)) {
    return { error: "Enter an amount greater than 0." };
  }
  if (amount > open) {
    return { error: `The amount cannot be more than the ${open} still owed (after deductions already in payroll).` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Choose a repayment date." };
  }
  const inserted = await loaded.pool
    .request()
    .input("companyId", sql.Int, loaded.session.company.id)
    .input("planId", sql.Int, id)
    .input("date", sql.Date, date)
    .input("amount", sql.Decimal(18, 2), amount)
    .input("note", sql.NVarChar(500), note.trim())
    .query<{ id: number }>(`
      INSERT INTO dbo.deduction_repayments (company_id, deduction_plan_id, repaid_on, amount, note)
      OUTPUT INSERTED.id
      VALUES (@companyId, @planId, @date, @amount, @note)
    `);
  return { id: inserted.recordset[0].id };
}

export async function deletePlanRepayment(planId: number, repaymentId: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, repaymentId)
    .input("planId", sql.Int, planId)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.deduction_repayments
      WHERE id = @id AND deduction_plan_id = @planId AND company_id = @companyId
    `);
  if (!result.rowsAffected[0]) {
    return { error: "This repayment was not found." };
  }
  return { id: repaymentId };
}

export async function deleteDeductionPlan(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const plan = findPlan(loaded.world, id);
  if (!plan) {
    return { error: "This record was not found." };
  }
  const used = loaded.world.runs.some((run) =>
    run.lines.some((line) => line.deductions.some((item) => item.componentId === plan.id)),
  );
  if (plan.repayments.length > 0 || used) {
    return { error: "This record has repayments and can only be closed." };
  }
  await loaded.pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, loaded.session.company.id)
    .query(`DELETE FROM dbo.deduction_plans WHERE id = @id AND company_id = @companyId`);
  return { id };
}

function adjustmentsFor(world: EngineWorld, period: string, excludeRunId: string | undefined, includeMidMonth: boolean) {
  return periodAdjustments({
    period,
    plans: world.plans,
    runs: world.runs,
    midMonthRuns: world.midMonthRuns,
    overtimeRuns: world.overtimeRuns,
    excludeRunId,
    includeMidMonth,
  });
}

async function replaceMonthlyLines(
  transaction: sql.Transaction,
  companyId: number,
  runId: number,
  built: Pick<PayrollRun, "lines" | "excluded" | "contributionColumns">,
) {
  await new sql.Request(transaction)
    .input("runId", sql.Int, runId)
    .input("companyId", sql.Int, companyId)
    .query(`
      DELETE e FROM dbo.payroll_run_earnings AS e
      INNER JOIN dbo.payroll_run_lines AS l ON l.id = e.line_id AND l.company_id = e.company_id
      WHERE l.payroll_run_id = @runId AND l.company_id = @companyId;
      DELETE d FROM dbo.payroll_run_deductions AS d
      INNER JOIN dbo.payroll_run_lines AS l ON l.id = d.line_id AND l.company_id = d.company_id
      WHERE l.payroll_run_id = @runId AND l.company_id = @companyId;
      DELETE c FROM dbo.payroll_run_contribution_lines AS c
      INNER JOIN dbo.payroll_run_lines AS l ON l.id = c.line_id AND l.company_id = c.company_id
      WHERE l.payroll_run_id = @runId AND l.company_id = @companyId;
      DELETE FROM dbo.payroll_run_lines WHERE payroll_run_id = @runId AND company_id = @companyId;
      DELETE FROM dbo.payroll_run_excluded WHERE payroll_run_id = @runId AND company_id = @companyId;
      DELETE FROM dbo.payroll_run_columns WHERE payroll_run_id = @runId AND company_id = @companyId;
    `);
  for (let index = 0; index < built.contributionColumns.length; index += 1) {
    const column = built.contributionColumns[index];
    await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, runId)
      .input("contributionId", sql.NVarChar(50), column.contributionId)
      .input("code", sql.NVarChar(50), column.code)
      .input("name", sql.NVarChar(200), column.name)
      .input("sortOrder", sql.Int, index)
      .query(`
        INSERT INTO dbo.payroll_run_columns (company_id, payroll_run_id, contribution_id, code, name, sort_order)
        VALUES (@companyId, @runId, @contributionId, @code, @name, @sortOrder)
      `);
  }
  for (const line of built.lines) {
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, runId)
      .input("employeeId", sql.Int, Number(line.employeeId))
      .input("employeeName", sql.NVarChar(300), line.employeeName)
      .input("department", sql.NVarChar(200), line.department)
      .input("designation", sql.NVarChar(200), line.designation)
      .input("basic", sql.Decimal(18, 2), line.basicSalary)
      .input("gross", sql.Decimal(18, 2), line.grossPay)
      .input("taxableEarnings", sql.Decimal(18, 2), line.taxableEarnings)
      .input("preTax", sql.Decimal(18, 2), line.preTaxDeductions)
      .input("taxableIncome", sql.Decimal(18, 2), line.taxableIncome)
      .input("paye", sql.Decimal(18, 2), line.paye)
      .input("employeeContributions", sql.Decimal(18, 2), line.employeeContributions)
      .input("other", sql.Decimal(18, 2), line.otherDeductions)
      .input("totalDeductions", sql.Decimal(18, 2), line.totalDeductions)
      .input("net", sql.Decimal(18, 2), line.netPay)
      .input("employerContributions", sql.Decimal(18, 2), line.employerContributions)
      .input("employerCost", sql.Decimal(18, 2), line.employerCost)
      .input("bankName", sql.NVarChar(200), line.bankName)
      .input("account", sql.NVarChar(50), line.accountNumber)
      .input("held", sql.Bit, line.held)
      .input("holdReason", sql.NVarChar(500), line.holdReason)
      .input("warnings", sql.NVarChar(1000), warningsText(line.warnings))
      .query<{ id: number }>(`
        INSERT INTO dbo.payroll_run_lines (
          company_id, payroll_run_id, employee_id, employee_name, department, designation,
          basic_salary, gross_pay, taxable_earnings, pre_tax_deductions, taxable_income, paye,
          employee_contributions, other_deductions, total_deductions, net_pay,
          employer_contributions, employer_cost, bank_name, account_number, held, hold_reason, warnings
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @runId, @employeeId, @employeeName, @department, @designation,
          @basic, @gross, @taxableEarnings, @preTax, @taxableIncome, @paye,
          @employeeContributions, @other, @totalDeductions, @net,
          @employerContributions, @employerCost, @bankName, @account, @held, @holdReason, @warnings
        )
      `);
    const lineId = inserted.recordset[0].id;
    for (let index = 0; index < line.earnings.length; index += 1) {
      const item = line.earnings[index];
      await new sql.Request(transaction)
        .input("companyId", sql.Int, companyId)
        .input("lineId", sql.Int, lineId)
        .input("componentId", sql.NVarChar(80), item.componentId)
        .input("code", sql.NVarChar(50), item.code)
        .input("name", sql.NVarChar(300), item.name)
        .input("amount", sql.Decimal(18, 2), item.amount)
        .input("taxable", sql.Bit, item.taxable)
        .input("sortOrder", sql.Int, index)
        .query(`
          INSERT INTO dbo.payroll_run_earnings (company_id, line_id, component_id, code, name, amount, taxable, sort_order)
          VALUES (@companyId, @lineId, @componentId, @code, @name, @amount, @taxable, @sortOrder)
        `);
    }
    for (let index = 0; index < line.deductions.length; index += 1) {
      const item = line.deductions[index];
      await new sql.Request(transaction)
        .input("companyId", sql.Int, companyId)
        .input("lineId", sql.Int, lineId)
        .input("componentId", sql.NVarChar(80), item.componentId)
        .input("code", sql.NVarChar(50), item.code)
        .input("name", sql.NVarChar(300), item.name)
        .input("amount", sql.Decimal(18, 2), item.amount)
        .input("taxable", sql.Bit, item.taxable)
        .input("sortOrder", sql.Int, index)
        .query(`
          INSERT INTO dbo.payroll_run_deductions (company_id, line_id, component_id, code, name, amount, taxable, sort_order)
          VALUES (@companyId, @lineId, @componentId, @code, @name, @amount, @taxable, @sortOrder)
        `);
    }
    for (let index = 0; index < line.contributions.length; index += 1) {
      const item = line.contributions[index];
      await new sql.Request(transaction)
        .input("companyId", sql.Int, companyId)
        .input("lineId", sql.Int, lineId)
        .input("contributionId", sql.NVarChar(50), item.contributionId)
        .input("code", sql.NVarChar(50), item.code)
        .input("name", sql.NVarChar(200), item.name)
        .input("baseAmount", sql.Decimal(18, 2), item.baseAmount)
        .input("employeeAmount", sql.Decimal(18, 2), item.employee)
        .input("employerAmount", sql.Decimal(18, 2), item.employer)
        .input("deductBeforeTax", sql.Bit, item.deductBeforeTax)
        .input("sortOrder", sql.Int, index)
        .query(`
          INSERT INTO dbo.payroll_run_contribution_lines (
            company_id, line_id, contribution_id, code, name, base_amount, employee_amount, employer_amount, deduct_before_tax, sort_order
          )
          VALUES (
            @companyId, @lineId, @contributionId, @code, @name, @baseAmount, @employeeAmount, @employerAmount, @deductBeforeTax, @sortOrder
          )
        `);
    }
  }
  for (const excluded of built.excluded) {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, runId)
      .input("employeeId", sql.Int, Number(excluded.employeeId))
      .input("employeeName", sql.NVarChar(300), excluded.employeeName)
      .input("reason", sql.NVarChar(300), excluded.reason)
      .query(`
        INSERT INTO dbo.payroll_run_excluded (company_id, payroll_run_id, employee_id, employee_name, reason)
        VALUES (@companyId, @runId, @employeeId, @employeeName, @reason)
      `);
  }
}

export async function createMonthlyRun(period: string) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  if (!validPeriod(period)) {
    return { error: "Choose a month." };
  }
  const problem = validateTaxBands(loaded.world.settings.taxBands)[0];
  if (problem) {
    return { error: problem === "Add at least one tax band." ? READINESS : problem };
  }
  if (loaded.world.runs.some((run) => run.period === period)) {
    return { error: "A payroll for this month already exists." };
  }
  const built = buildPayrollRunLines({
    period,
    employees: loaded.world.employees,
    profiles: loaded.world.profiles,
    holds: loaded.world.holds,
    banks: loaded.world.banks,
    settings: loaded.world.settings,
    adjustments: adjustmentsFor(loaded.world, period, undefined, true),
  });
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("period", sql.Char(7), period)
      .input("createdOn", sql.Date, todayIso())
      .input("calculatedOn", sql.DateTime2, new Date())
      .query<{ id: number }>(`
        INSERT INTO dbo.payroll_runs (company_id, period, status, created_on, calculated_on)
        OUTPUT INSERTED.id
        VALUES (@companyId, @period, N'Draft', @createdOn, @calculatedOn)
      `);
    const id = inserted.recordset[0].id;
    await replaceMonthlyLines(transaction, loaded.session.company.id, id, built);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (errorNumber(error) === 2627 || errorNumber(error) === 2601) {
      return { error: "A payroll for this month already exists." };
    }
    throw error;
  }
}

export async function listMonthlyRuns(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0, readiness: "" };
  }
  const pool = await getPool();
  const world = await loadEngineWorld(session.company.id, pool);
  const readiness = validateTaxBands(world.settings.taxBands).length > 0 ? READINESS : "";
  const search = list.search.trim().toLowerCase();
  const runs = await pool.request().input("companyId", sql.Int, session.company.id).query<{
    id: number;
    period: string;
    status: PayrollRunStatus;
    created_on: Date;
  }>(`SELECT id, period, status, created_on FROM dbo.payroll_runs WHERE company_id = @companyId`);
  let rows = await Promise.all(
    runs.recordset.map(async (run) => {
      const lines = await pool
        .request()
        .input("runId", sql.Int, run.id)
        .input("companyId", sql.Int, session.company.id)
        .query<{ gross_pay: number; paye: number; net_pay: number; employer_cost: number; held: boolean }>(`
          SELECT gross_pay, paye, net_pay, employer_cost, held
          FROM dbo.payroll_run_lines
          WHERE payroll_run_id = @runId AND company_id = @companyId
        `);
      const totals = payrollTotals(
        lines.recordset.map((line) => ({
          ...emptyPay(String(run.id)),
          grossPay: money(line.gross_pay),
          paye: money(line.paye),
          netPay: money(line.net_pay),
          employerCost: money(line.employer_cost),
          held: flag(line.held),
        })),
      );
      return {
        id: run.id,
        period: text(run.period).slice(0, 7),
        status: run.status,
        employees: totals.employees,
        grossPay: totals.grossPay,
        paye: totals.paye,
        netPayable: totals.netPayable,
        employerCost: totals.employerCost,
        createdOn: formatDate(run.created_on),
      };
    }),
  );
  rows = rows.filter(
    (row) =>
      !search ||
      row.period.includes(search) ||
      formatPeriod(row.period).toLowerCase().includes(search) ||
      row.status.toLowerCase().includes(search),
  );
  const columns: Record<string, (row: (typeof rows)[number]) => string | number> = {
    period: (row) => row.period,
    status: (row) => row.status,
    employees: (row) => row.employees,
    grossPay: (row) => row.grossPay,
    paye: (row) => row.paye,
    netPayable: (row) => row.netPayable,
    employerCost: (row) => row.employerCost,
    createdOn: (row) => row.createdOn,
  };
  const pick = columns[list.sortKey];
  rows.sort((a, b) => {
    if (!pick) {
      return b.period.localeCompare(a.period);
    }
    const left = pick(a);
    const right = pick(b);
    const compared = left < right ? -1 : left > right ? 1 : 0;
    return list.sortDirection === "desc" ? -compared : compared;
  });
  const start = (list.page - 1) * list.pageSize;
  return { readiness, totalCount: rows.length, rows: rows.slice(start, start + list.pageSize) };
}

function emptyPay(employeeId: string): PayrollRun["lines"][number] {
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

export async function getMonthlyRun(id: number, search = "") {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const header = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query<{
      id: number;
      period: string;
      status: PayrollRunStatus;
      created_on: Date;
      calculated_on: Date | null;
      approved_by: string;
      approved_on: Date | null;
      locked_on: Date | null;
    }>(`
      SELECT id, period, status, created_on, calculated_on, approved_by, approved_on, locked_on
      FROM dbo.payroll_runs
      WHERE id = @id AND company_id = @companyId
    `);
  const run = header.recordset[0];
  if (!run) {
    return { error: "This payroll was not found." };
  }
  const period = text(run.period).slice(0, 7);
  const lines = await pool
    .request()
    .input("runId", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), `%${search.trim()}%`)
    .query<{
      id: number;
      employee_id: number;
      employee_code: string;
      employee_name: string;
      department: string;
      designation: string;
      basic_salary: number;
      gross_pay: number;
      taxable_earnings: number;
      pre_tax_deductions: number;
      taxable_income: number;
      paye: number;
      employee_contributions: number;
      other_deductions: number;
      total_deductions: number;
      net_pay: number;
      employer_contributions: number;
      employer_cost: number;
      bank_name: string;
      account_number: string;
      held: boolean;
      hold_reason: string;
      warnings: string;
    }>(`
      SELECT l.id, l.employee_id, e.employee_code, l.employee_name, l.department, l.designation,
             l.basic_salary, l.gross_pay, l.taxable_earnings, l.pre_tax_deductions, l.taxable_income, l.paye,
             l.employee_contributions, l.other_deductions, l.total_deductions, l.net_pay,
             l.employer_contributions, l.employer_cost, l.bank_name, l.account_number, l.held, l.hold_reason, l.warnings
      FROM dbo.payroll_run_lines AS l
      INNER JOIN dbo.employees AS e ON e.id = l.employee_id AND e.company_id = l.company_id
      WHERE l.payroll_run_id = @runId AND l.company_id = @companyId
        AND (
          @search = N'%%'
          OR l.employee_name LIKE @search
          OR e.employee_code LIKE @search
          OR l.department LIKE @search
        )
      ORDER BY l.employee_name
    `);
  const earnings = await pool.request().input("companyId", sql.Int, session.company.id).input("runId", sql.Int, id).query<{
    line_id: number;
    component_id: string;
    code: string;
    name: string;
    amount: number;
    taxable: boolean;
  }>(`
    SELECT e.line_id, e.component_id, e.code, e.name, e.amount, e.taxable
    FROM dbo.payroll_run_earnings AS e
    INNER JOIN dbo.payroll_run_lines AS l ON l.id = e.line_id AND l.company_id = e.company_id
    WHERE l.payroll_run_id = @runId AND l.company_id = @companyId
    ORDER BY e.sort_order, e.id
  `);
  const deductions = await pool.request().input("companyId", sql.Int, session.company.id).input("runId", sql.Int, id).query<{
    line_id: number;
    component_id: string;
    code: string;
    name: string;
    amount: number;
    taxable: boolean;
  }>(`
    SELECT d.line_id, d.component_id, d.code, d.name, d.amount, d.taxable
    FROM dbo.payroll_run_deductions AS d
    INNER JOIN dbo.payroll_run_lines AS l ON l.id = d.line_id AND l.company_id = d.company_id
    WHERE l.payroll_run_id = @runId AND l.company_id = @companyId
    ORDER BY d.sort_order, d.id
  `);
  const contributions = await pool.request().input("companyId", sql.Int, session.company.id).input("runId", sql.Int, id).query<{
    line_id: number;
    contribution_id: string;
    code: string;
    name: string;
    base_amount: number;
    employee_amount: number;
    employer_amount: number;
    deduct_before_tax: boolean;
  }>(`
    SELECT c.line_id, c.contribution_id, c.code, c.name, c.base_amount, c.employee_amount, c.employer_amount, c.deduct_before_tax
    FROM dbo.payroll_run_contribution_lines AS c
    INNER JOIN dbo.payroll_run_lines AS l ON l.id = c.line_id AND l.company_id = c.company_id
    WHERE l.payroll_run_id = @runId AND l.company_id = @companyId
    ORDER BY c.sort_order, c.id
  `);
  const columns = await pool.request().input("companyId", sql.Int, session.company.id).input("runId", sql.Int, id).query<{
    contribution_id: string;
    code: string;
    name: string;
  }>(`
    SELECT contribution_id, code, name
    FROM dbo.payroll_run_columns
    WHERE payroll_run_id = @runId AND company_id = @companyId
    ORDER BY sort_order
  `);
  const excluded = await pool.request().input("companyId", sql.Int, session.company.id).input("runId", sql.Int, id).query<{
    employee_id: number;
    employee_name: string;
    reason: string;
  }>(`
    SELECT employee_id, employee_name, reason
    FROM dbo.payroll_run_excluded
    WHERE payroll_run_id = @runId AND company_id = @companyId
    ORDER BY employee_name
  `);
  const notices: { text: string; href: string }[] = [];
  if (run.status === "Draft") {
    const mid = await pool.request().input("companyId", sql.Int, session.company.id).input("period", sql.Char(7), period).query<{ id: number; status: string }>(`
      SELECT id, status FROM dbo.mid_month_runs WHERE company_id = @companyId AND period = @period AND status <> N'Locked'
    `);
    for (const item of mid.recordset) {
      notices.push({
        text: `The mid-month payroll is ${item.status.toLowerCase()}. Its payments are deducted here only once it is locked.`,
        href: `/payroll/mid-month/${item.id}`,
      });
    }
    const overtime = await pool.request().input("companyId", sql.Int, session.company.id).input("period", sql.Char(7), period).query<{ id: number; period: string; status: string }>(`
      SELECT id, period, status FROM dbo.overtime_runs WHERE company_id = @companyId AND pay_period = @period AND status <> N'Locked'
    `);
    for (const item of overtime.recordset) {
      notices.push({
        text: `The ${formatPeriod(text(item.period).slice(0, 7))} overtime sheet is ${item.status.toLowerCase()}. Its overtime is paid here only once it is locked.`,
        href: `/payroll/overtime/${item.id}`,
      });
    }
  }
  const mappedLines = lines.recordset.map((line) => ({
    ...emptyPay(String(line.employee_id)),
    employeeCode: line.employee_code,
    employeeName: line.employee_name,
    department: text(line.department),
    designation: text(line.designation),
    basicSalary: money(line.basic_salary),
    grossPay: money(line.gross_pay),
    taxableEarnings: money(line.taxable_earnings),
    preTaxDeductions: money(line.pre_tax_deductions),
    taxableIncome: money(line.taxable_income),
    paye: money(line.paye),
    employeeContributions: money(line.employee_contributions),
    otherDeductions: money(line.other_deductions),
    totalDeductions: money(line.total_deductions),
    netPay: money(line.net_pay),
    employerContributions: money(line.employer_contributions),
    employerCost: money(line.employer_cost),
    bankName: text(line.bank_name),
    accountNumber: text(line.account_number),
    held: flag(line.held),
    holdReason: text(line.hold_reason),
    warnings: warningsList(line.warnings),
    earnings: earnings.recordset
      .filter((item) => item.line_id === line.id)
      .map((item) => ({
        componentId: item.component_id,
        code: item.code,
        name: item.name,
        amount: money(item.amount),
        taxable: flag(item.taxable),
      })),
    deductions: deductions.recordset
      .filter((item) => item.line_id === line.id)
      .map((item) => ({
        componentId: item.component_id,
        code: item.code,
        name: item.name,
        amount: money(item.amount),
        taxable: flag(item.taxable),
      })),
    contributions: contributions.recordset
      .filter((item) => item.line_id === line.id)
      .map((item) => ({
        contributionId: item.contribution_id,
        code: item.code,
        name: item.name,
        baseAmount: money(item.base_amount),
        employee: money(item.employee_amount),
        employer: money(item.employer_amount),
        deductBeforeTax: flag(item.deduct_before_tax),
      })),
  }));
  return {
    run: {
      id: run.id,
      period,
      status: run.status,
      createdOn: formatDate(run.created_on),
      calculatedOn: run.calculated_on ? new Date(run.calculated_on).toISOString() : "",
      approvedBy: text(run.approved_by),
      approvedOn: formatDate(run.approved_on),
      lockedOn: formatDate(run.locked_on),
      contributionColumns: columns.recordset.map((column) => ({
        contributionId: column.contribution_id,
        code: column.code,
        name: column.name,
      })),
      lines: mappedLines,
      excluded: excluded.recordset.map((row) => ({
        employeeId: String(row.employee_id),
        employeeName: row.employee_name,
        reason: row.reason,
      })),
    },
    notices,
  };
}

export async function recalculateMonthlyRun(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const current = loaded.world.runs.find((run) => run.id === String(id));
  if (!current || current.status !== "Draft") {
    return { error: "Only draft payrolls can be recalculated." };
  }
  const problem = validateTaxBands(loaded.world.settings.taxBands)[0];
  if (problem) {
    return { error: problem === "Add at least one tax band." ? READINESS : problem };
  }
  const built = buildPayrollRunLines({
    period: current.period,
    employees: loaded.world.employees,
    profiles: loaded.world.profiles,
    holds: loaded.world.holds,
    banks: loaded.world.banks,
    settings: loaded.world.settings,
    adjustments: adjustmentsFor(loaded.world, current.period, String(id), true),
  });
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("calculatedOn", sql.DateTime2, new Date())
      .query(`UPDATE dbo.payroll_runs SET calculated_on = @calculatedOn WHERE id = @id AND company_id = @companyId AND status = N'Draft'`);
    await replaceMonthlyLines(transaction, loaded.session.company.id, id, built);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function setRunStatus(table: "payroll_runs" | "mid_month_runs" | "overtime_runs", id: number, from: PayrollRunStatus, to: PayrollRunStatus, fields: string) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("approvedBy", sql.NVarChar(200), "")
    .input("today", sql.Date, todayIso())
    .query(`
      UPDATE dbo.${table}
      SET status = N'${to}'${fields}
      WHERE id = @id AND company_id = @companyId AND status = N'${from}'
    `);
  if (!result.rowsAffected[0]) {
    return { error: "This payroll was not found." };
  }
  return { id };
}

export function approveNamedRun(table: "payroll_runs" | "mid_month_runs" | "overtime_runs", id: number, approvedBy: string) {
  const name = approvedBy.trim();
  if (!name) {
    return Promise.resolve({ error: "Enter the approver's name." });
  }
  return (async () => {
    const session = await requireCompany();
    if ("error" in session) {
      return session;
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("approvedBy", sql.NVarChar(200), name)
      .input("today", sql.Date, todayIso())
      .query(`
        UPDATE dbo.${table}
        SET status = N'Approved', approved_by = @approvedBy, approved_on = @today
        WHERE id = @id AND company_id = @companyId AND status = N'Draft'
      `);
    if (!result.rowsAffected[0]) {
      return { error: "Only a draft can be approved." };
    }
    return { id };
  })();
}

export function reopenNamedRun(table: "payroll_runs" | "mid_month_runs" | "overtime_runs", id: number) {
  return setRunStatus(table, id, "Approved", "Draft", ", approved_by = N'', approved_on = NULL");
}

export function lockNamedRun(table: "payroll_runs" | "mid_month_runs" | "overtime_runs", id: number) {
  return setRunStatus(table, id, "Approved", "Locked", ", locked_on = @today");
}

export async function deleteMonthlyRun(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query<{ status: string }>(`SELECT status FROM dbo.payroll_runs WHERE id = @id AND company_id = @companyId`);
    if (current.recordset[0]?.status !== "Draft") {
      await transaction.rollback();
      return { error: "Only a draft payroll can be deleted." };
    }
    await replaceMonthlyLines(transaction, session.company.id, id, { lines: [], excluded: [], contributionColumns: [] });
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`DELETE FROM dbo.payroll_runs WHERE id = @id AND company_id = @companyId`);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function createMidMonthRun(period: string, basis: MidMonthBasis, value: number, paymentDate: string) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  if (!validPeriod(period)) {
    return { error: "Choose a month." };
  }
  if (validateTaxBands(loaded.world.settings.taxBands).length > 0) {
    return { error: READINESS };
  }
  if (loaded.world.midMonthRuns.some((run) => run.period === period)) {
    return { error: "A mid-month payroll for this month already exists." };
  }
  if (!(value > 0)) {
    return {
      error: basis === "Fixed amount" ? "Enter the amount to pay each employee." : "Enter the percentage of basic salary to pay.",
    };
  }
  if (basis === "% of basic salary" && value > 100) {
    return { error: "The percentage cannot be more than 100." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return { error: "Choose the payment date." };
  }
  const blocked = monthlyBlocked(loaded.world, period, "mid");
  if (blocked) {
    return { error: blocked };
  }
  const monthly = loaded.world.runs.find((run) => run.period === period);
  const built = buildMidMonthLines({
    period,
    basis,
    value,
    employees: loaded.world.employees,
    profiles: loaded.world.profiles,
    holds: loaded.world.holds,
    banks: loaded.world.banks,
    settings: loaded.world.settings,
    adjustments: adjustmentsFor(loaded.world, period, monthly?.id, false),
    overrides: new Map(),
  });
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("period", sql.Char(7), period)
      .input("basis", sql.NVarChar(30), basis)
      .input("value", sql.Decimal(18, 2), value)
      .input("paymentDate", sql.Date, paymentDate)
      .input("createdOn", sql.Date, todayIso())
      .input("calculatedOn", sql.DateTime2, new Date())
      .query<{ id: number }>(`
        INSERT INTO dbo.mid_month_runs (company_id, period, status, basis, value, payment_date, created_on, calculated_on)
        OUTPUT INSERTED.id
        VALUES (@companyId, @period, N'Draft', @basis, @value, @paymentDate, @createdOn, @calculatedOn)
      `);
    await writeMidMonthLines(transaction, loaded.session.company.id, inserted.recordset[0].id, built);
    await transaction.commit();
    return { id: inserted.recordset[0].id };
  } catch (error) {
    await transaction.rollback();
    if (errorNumber(error) === 2627 || errorNumber(error) === 2601) {
      return { error: "A mid-month payroll for this month already exists." };
    }
    throw error;
  }
}

async function writeMidMonthLines(
  transaction: sql.Transaction,
  companyId: number,
  runId: number,
  built: Pick<MidMonthRun, "lines" | "excluded">,
) {
  await new sql.Request(transaction)
    .input("runId", sql.Int, runId)
    .input("companyId", sql.Int, companyId)
    .query(`
      DELETE FROM dbo.mid_month_lines WHERE mid_month_run_id = @runId AND company_id = @companyId;
      DELETE FROM dbo.mid_month_excluded WHERE mid_month_run_id = @runId AND company_id = @companyId;
    `);
  for (const line of built.lines) {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, runId)
      .input("employeeId", sql.Int, Number(line.employeeId))
      .input("employeeName", sql.NVarChar(300), line.employeeName)
      .input("department", sql.NVarChar(200), line.department)
      .input("designation", sql.NVarChar(200), line.designation)
      .input("basic", sql.Decimal(18, 2), line.basicSalary)
      .input("estimated", sql.Decimal(18, 2), line.estimatedNet)
      .input("defaultAmount", sql.Decimal(18, 2), line.defaultAmount)
      .input("amount", sql.Decimal(18, 2), line.amount)
      .input("overridden", sql.Bit, line.overridden)
      .input("bankName", sql.NVarChar(200), line.bankName)
      .input("account", sql.NVarChar(50), line.accountNumber)
      .input("warnings", sql.NVarChar(1000), warningsText(line.warnings))
      .query(`
        INSERT INTO dbo.mid_month_lines (
          company_id, mid_month_run_id, employee_id, employee_name, department, designation,
          basic_salary, estimated_net, default_amount, amount, overridden, bank_name, account_number, warnings
        )
        VALUES (
          @companyId, @runId, @employeeId, @employeeName, @department, @designation,
          @basic, @estimated, @defaultAmount, @amount, @overridden, @bankName, @account, @warnings
        )
      `);
  }
  for (const row of built.excluded) {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, runId)
      .input("employeeId", sql.Int, Number(row.employeeId))
      .input("employeeName", sql.NVarChar(300), row.employeeName)
      .input("reason", sql.NVarChar(300), row.reason)
      .query(`
        INSERT INTO dbo.mid_month_excluded (company_id, mid_month_run_id, employee_id, employee_name, reason)
        VALUES (@companyId, @runId, @employeeId, @employeeName, @reason)
      `);
  }
}

export async function listMidMonthRuns(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0, readiness: "" };
  }
  const pool = await getPool();
  const world = await loadEngineWorld(session.company.id, pool);
  const rowsResult = await pool.request().input("companyId", sql.Int, session.company.id).query<{
    id: number;
    period: string;
    status: PayrollRunStatus;
    basis: MidMonthBasis;
    value: number;
    payment_date: Date;
    created_on: Date;
    employees: number;
    amount: number;
  }>(`
    SELECT r.id, r.period, r.status, r.basis, r.value, r.payment_date, r.created_on,
      (SELECT COUNT(*) FROM dbo.mid_month_lines AS l WHERE l.mid_month_run_id = r.id AND l.amount > 0) AS employees,
      (SELECT ISNULL(SUM(l.amount), 0) FROM dbo.mid_month_lines AS l WHERE l.mid_month_run_id = r.id AND l.amount > 0) AS amount
    FROM dbo.mid_month_runs AS r
    WHERE r.company_id = @companyId
  `);
  const search = list.search.trim().toLowerCase();
  let rows = rowsResult.recordset
    .map((row) => ({
      id: row.id,
      period: text(row.period).slice(0, 7),
      status: row.status,
      basis: row.basis,
      value: money(row.value),
      paymentDate: formatDate(row.payment_date),
      createdOn: formatDate(row.created_on),
      employees: row.employees,
      amount: money(row.amount),
    }))
    .filter((row) => !search || formatPeriod(row.period).toLowerCase().includes(search) || row.status.toLowerCase().includes(search));
  rows.sort((a, b) => (list.sortKey ? 0 : b.period.localeCompare(a.period)));
  if (list.sortKey) {
    rows.sort((a, b) => {
      const left = String((a as Record<string, unknown>)[list.sortKey] ?? "");
      const right = String((b as Record<string, unknown>)[list.sortKey] ?? "");
      const compared = left < right ? -1 : left > right ? 1 : 0;
      return list.sortDirection === "desc" ? -compared : compared;
    });
  }
  const start = (list.page - 1) * list.pageSize;
  return {
    readiness: validateTaxBands(world.settings.taxBands).length > 0 ? READINESS : "",
    totalCount: rows.length,
    rows: rows.slice(start, start + list.pageSize),
  };
}

export async function getMidMonthRun(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const header = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query<{
      id: number;
      period: string;
      status: PayrollRunStatus;
      basis: MidMonthBasis;
      value: number;
      payment_date: Date;
      created_on: Date;
      calculated_on: Date | null;
      approved_by: string;
      approved_on: Date | null;
      locked_on: Date | null;
    }>(`
      SELECT id, period, status, basis, value, payment_date, created_on, calculated_on, approved_by, approved_on, locked_on
      FROM dbo.mid_month_runs WHERE id = @id AND company_id = @companyId
    `);
  const run = header.recordset[0];
  if (!run) {
    return { error: "This payroll was not found." };
  }
  const lines = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    employee_id: number;
    employee_code: string;
    employee_name: string;
    department: string;
    designation: string;
    basic_salary: number;
    estimated_net: number;
    default_amount: number;
    amount: number;
    overridden: boolean;
    bank_name: string;
    account_number: string;
    warnings: string;
  }>(`
    SELECT l.employee_id, e.employee_code, l.employee_name, l.department, l.designation, l.basic_salary,
           l.estimated_net, l.default_amount, l.amount, l.overridden, l.bank_name, l.account_number, l.warnings
    FROM dbo.mid_month_lines AS l
    INNER JOIN dbo.employees AS e ON e.id = l.employee_id AND e.company_id = l.company_id
    WHERE l.mid_month_run_id = @id AND l.company_id = @companyId
    ORDER BY l.employee_name
  `);
  const excluded = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    employee_id: number;
    employee_name: string;
    reason: string;
  }>(`SELECT employee_id, employee_name, reason FROM dbo.mid_month_excluded WHERE mid_month_run_id = @id AND company_id = @companyId`);
  const period = text(run.period).slice(0, 7);
  const monthly = await pool.request().input("companyId", sql.Int, session.company.id).input("period", sql.Char(7), period).query<{ id: number; status: PayrollRunStatus }>(`
    SELECT id, status FROM dbo.payroll_runs WHERE company_id = @companyId AND period = @period
  `);
  return {
    id: run.id,
    period,
    status: run.status,
    basis: run.basis,
    value: money(run.value),
    paymentDate: formatDate(run.payment_date),
    createdOn: formatDate(run.created_on),
    calculatedOn: run.calculated_on ? new Date(run.calculated_on).toISOString() : "",
    approvedBy: text(run.approved_by),
    approvedOn: formatDate(run.approved_on),
    lockedOn: formatDate(run.locked_on),
    lines: lines.recordset.map((line) => ({
      employeeId: String(line.employee_id),
      employeeCode: line.employee_code,
      employeeName: line.employee_name,
      department: text(line.department),
      designation: text(line.designation),
      basicSalary: money(line.basic_salary),
      estimatedNet: money(line.estimated_net),
      defaultAmount: money(line.default_amount),
      amount: money(line.amount),
      overridden: flag(line.overridden),
      bankName: text(line.bank_name),
      accountNumber: text(line.account_number),
      warnings: warningsList(line.warnings),
    })),
    excluded: excluded.recordset.map((row) => ({
      employeeId: String(row.employee_id),
      employeeName: row.employee_name,
      reason: row.reason,
    })),
    monthly: monthly.recordset[0] ? { id: monthly.recordset[0].id, status: monthly.recordset[0].status } : null,
  };
}

export async function setMidMonthAmount(id: number, employeeId: number, amount: number | null) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const current = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, employeeId)
    .query<{ status: string; default_amount: number; estimated_net: number; bank_name: string; account_number: string }>(`
      SELECT r.status, l.default_amount, l.estimated_net, l.bank_name, l.account_number
      FROM dbo.mid_month_lines AS l
      INNER JOIN dbo.mid_month_runs AS r ON r.id = l.mid_month_run_id AND r.company_id = l.company_id
      WHERE r.id = @id AND r.company_id = @companyId AND l.employee_id = @employeeId
    `);
  const line = current.recordset[0];
  if (!line || line.status !== "Draft") {
    return { error: "Only a draft mid-month payroll can be changed." };
  }
  const next = amount === null ? money(line.default_amount) : Math.max(0, amount);
  const warnings = midMonthWarnings(next, money(line.estimated_net), Boolean(text(line.bank_name) && text(line.account_number).trim()));
  await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, employeeId)
    .input("amount", sql.Decimal(18, 2), next)
    .input("overridden", sql.Bit, amount !== null)
    .input("warnings", sql.NVarChar(1000), warningsText(warnings))
    .query(`
      UPDATE dbo.mid_month_lines
      SET amount = @amount, overridden = @overridden, warnings = @warnings
      WHERE mid_month_run_id = @id AND company_id = @companyId AND employee_id = @employeeId
    `);
  return { id };
}

export async function recalculateMidMonthRun(id: number, setup?: { basis: MidMonthBasis; value: number; paymentDate: string }) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const pool = loaded.pool;
  const current = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, loaded.session.company.id)
    .query<{ period: string; status: string; basis: MidMonthBasis; value: number; payment_date: Date }>(`
      SELECT period, status, basis, value, payment_date FROM dbo.mid_month_runs WHERE id = @id AND company_id = @companyId
    `);
  const run = current.recordset[0];
  if (!run || run.status !== "Draft") {
    return { error: "Only draft payrolls can be recalculated." };
  }
  if (validateTaxBands(loaded.world.settings.taxBands).length > 0) {
    return { error: READINESS };
  }
  const basis = setup?.basis ?? run.basis;
  const value = setup?.value ?? money(run.value);
  const paymentDate = setup?.paymentDate ?? formatDate(run.payment_date);
  if (!(value > 0)) {
    return { error: basis === "Fixed amount" ? "Enter the amount to pay each employee." : "Enter the percentage of basic salary to pay." };
  }
  if (basis === "% of basic salary" && value > 100) {
    return { error: "The percentage cannot be more than 100." };
  }
  const period = text(run.period).slice(0, 7);
  const overrides = new Map<string, number>();
  if (!setup) {
    const kept = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{ employee_id: number; amount: number }>(`
      SELECT employee_id, amount FROM dbo.mid_month_lines WHERE mid_month_run_id = @id AND company_id = @companyId AND overridden = 1
    `);
    for (const row of kept.recordset) {
      overrides.set(String(row.employee_id), money(row.amount));
    }
  }
  const monthly = loaded.world.runs.find((item) => item.period === period);
  const built = buildMidMonthLines({
    period,
    basis,
    value,
    employees: loaded.world.employees,
    profiles: loaded.world.profiles,
    holds: loaded.world.holds,
    banks: loaded.world.banks,
    settings: loaded.world.settings,
    adjustments: adjustmentsFor(loaded.world, period, monthly?.id, false),
    overrides,
  });
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("basis", sql.NVarChar(30), basis)
      .input("value", sql.Decimal(18, 2), value)
      .input("paymentDate", sql.Date, paymentDate)
      .input("calculatedOn", sql.DateTime2, new Date())
      .query(`
        UPDATE dbo.mid_month_runs
        SET basis = @basis, value = @value, payment_date = @paymentDate, calculated_on = @calculatedOn
        WHERE id = @id AND company_id = @companyId AND status = N'Draft'
      `);
    await writeMidMonthLines(transaction, loaded.session.company.id, id, built);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteMidMonthRun(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query<{ status: string }>(`SELECT status FROM dbo.mid_month_runs WHERE id = @id AND company_id = @companyId`);
    if (current.recordset[0]?.status !== "Draft") {
      await transaction.rollback();
      return { error: "Only a draft payroll can be deleted." };
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`
        DELETE FROM dbo.mid_month_lines WHERE mid_month_run_id = @id AND company_id = @companyId;
        DELETE FROM dbo.mid_month_excluded WHERE mid_month_run_id = @id AND company_id = @companyId;
        DELETE FROM dbo.mid_month_runs WHERE id = @id AND company_id = @companyId;
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function lockMidMonthRun(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const header = await loaded.pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{ period: string; status: string }>(`
    SELECT period, status FROM dbo.mid_month_runs WHERE id = @id AND company_id = @companyId
  `);
  const run = header.recordset[0];
  if (run?.status !== "Approved") {
    return { error: "Only approved payrolls can be locked." };
  }
  const blocked = monthlyBlocked(loaded.world, text(run.period).slice(0, 7), "mid");
  if (blocked) {
    return { error: `${blocked} Move it back to draft first.` };
  }
  return lockNamedRun("mid_month_runs", id);
}

export async function createOvertimeRun(period: string, payPeriod: string) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const problem =
    overtimeReadiness(loaded.world.overtimeTypes, loaded.world.overtimeSettings)[0] ||
    (loaded.world.overtimeRuns.some((run) => run.period === period) ? "An overtime sheet for this month already exists." : "") ||
    (payPeriod < period ? "Overtime cannot be paid before the month it was worked." : "") ||
    monthlyBlocked(loaded.world, payPeriod, "overtime");
  if (problem) {
    return { error: problem };
  }
  try {
    const inserted = await loaded.pool
      .request()
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("period", sql.Char(7), period)
      .input("payPeriod", sql.Char(7), payPeriod)
      .input("createdOn", sql.Date, todayIso())
      .query<{ id: number }>(`
        INSERT INTO dbo.overtime_runs (company_id, period, pay_period, status, created_on)
        OUTPUT INSERTED.id
        VALUES (@companyId, @period, @payPeriod, N'Draft', @createdOn)
      `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (errorNumber(error) === 2627 || errorNumber(error) === 2601) {
      return { error: "An overtime sheet for this month already exists." };
    }
    throw error;
  }
}

export async function listOvertimeRuns(list: PayrollListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0, problems: [] as string[] };
  }
  const pool = await getPool();
  const world = await loadEngineWorld(session.company.id, pool);
  const result = await pool.request().input("companyId", sql.Int, session.company.id).query<{
    id: number;
    period: string;
    pay_period: string;
    status: PayrollRunStatus;
    created_on: Date;
    employees: number;
    hours: number;
    amount: number;
  }>(`
    SELECT r.id, r.period, r.pay_period, r.status, r.created_on,
      (SELECT COUNT(*) FROM dbo.overtime_lines AS l WHERE l.overtime_run_id = r.id) AS employees,
      (SELECT ISNULL(SUM(l.hours), 0) FROM dbo.overtime_lines AS l WHERE l.overtime_run_id = r.id) AS hours,
      (SELECT ISNULL(SUM(l.amount), 0) FROM dbo.overtime_lines AS l WHERE l.overtime_run_id = r.id) AS amount
    FROM dbo.overtime_runs AS r
    WHERE r.company_id = @companyId
  `);
  const search = list.search.trim().toLowerCase();
  let rows = result.recordset
    .map((row) => ({
      id: row.id,
      period: text(row.period).slice(0, 7),
      payPeriod: text(row.pay_period).slice(0, 7),
      status: row.status,
      createdOn: formatDate(row.created_on),
      employees: row.employees,
      hours: money(row.hours),
      amount: money(row.amount),
    }))
    .filter((row) => !search || formatPeriod(row.period).toLowerCase().includes(search) || row.status.toLowerCase().includes(search));
  rows.sort((a, b) => b.period.localeCompare(a.period));
  const start = (list.page - 1) * list.pageSize;
  return {
    problems: overtimeReadiness(world.overtimeTypes, world.overtimeSettings),
    totalCount: rows.length,
    rows: rows.slice(start, start + list.pageSize),
  };
}

export async function getOvertimeRun(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const world = await loadEngineWorld(session.company.id, pool);
  const header = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    id: number;
    period: string;
    pay_period: string;
    status: PayrollRunStatus;
    created_on: Date;
    calculated_on: Date | null;
    approved_by: string;
    approved_on: Date | null;
    locked_on: Date | null;
  }>(`
    SELECT id, period, pay_period, status, created_on, calculated_on, approved_by, approved_on, locked_on
    FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  const run = header.recordset[0];
  if (!run) {
    return { error: "This overtime sheet was not found." };
  }
  const entries = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    id: number;
    employee_id: number;
    employee_code: string;
    employee_name: string;
    overtime_type_id: number;
    worked_on: Date;
    hours: number;
    note: string;
  }>(`
    SELECT n.id, n.employee_id, e.employee_code,
           LTRIM(RTRIM(CONCAT(e.first_name, N' ', CASE WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N'' ELSE e.middle_name + N' ' END, e.last_name))) AS employee_name,
           n.overtime_type_id, n.worked_on, n.hours, n.note
    FROM dbo.overtime_entries AS n
    INNER JOIN dbo.employees AS e ON e.id = n.employee_id AND e.company_id = n.company_id
    WHERE n.overtime_run_id = @id AND n.company_id = @companyId
    ORDER BY n.worked_on, n.id
  `);
  const lines = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    id: number;
    employee_id: number;
    employee_code: string;
    employee_name: string;
    department: string;
    basic_salary: number;
    hourly_rate: number;
    hours: number;
    amount: number;
  }>(`
    SELECT l.id, l.employee_id, e.employee_code, l.employee_name, l.department, l.basic_salary, l.hourly_rate, l.hours, l.amount
    FROM dbo.overtime_lines AS l
    INNER JOIN dbo.employees AS e ON e.id = l.employee_id AND e.company_id = l.company_id
    WHERE l.overtime_run_id = @id AND l.company_id = @companyId
    ORDER BY l.employee_name
  `);
  const items = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    overtime_line_id: number;
    overtime_type_id: number;
    code: string;
    name: string;
    multiplier: number;
    taxable: boolean;
    hours: number;
    amount: number;
  }>(`
    SELECT i.overtime_line_id, i.overtime_type_id, i.code, i.name, i.multiplier, i.taxable, i.hours, i.amount
    FROM dbo.overtime_line_items AS i
    INNER JOIN dbo.overtime_lines AS l ON l.id = i.overtime_line_id AND l.company_id = i.company_id
    WHERE l.overtime_run_id = @id AND l.company_id = @companyId
  `);
  const excluded = await pool.request().input("id", sql.Int, id).input("companyId", sql.Int, session.company.id).query<{
    employee_id: number;
    employee_name: string;
    reason: string;
  }>(`SELECT employee_id, employee_name, reason FROM dbo.overtime_excluded WHERE overtime_run_id = @id AND company_id = @companyId`);
  const payPeriod = text(run.pay_period).slice(0, 7);
  const monthly = await pool.request().input("companyId", sql.Int, session.company.id).input("period", sql.Char(7), payPeriod).query<{ id: number; status: PayrollRunStatus }>(`
    SELECT id, status FROM dbo.payroll_runs WHERE company_id = @companyId AND period = @period
  `);
  return {
    id: run.id,
    period: text(run.period).slice(0, 7),
    payPeriod,
    status: run.status,
    createdOn: formatDate(run.created_on),
    calculatedOn: run.calculated_on ? new Date(run.calculated_on).toISOString() : "",
    approvedBy: text(run.approved_by),
    approvedOn: formatDate(run.approved_on),
    lockedOn: formatDate(run.locked_on),
    entries: entries.recordset.map((row) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      typeId: String(row.overtime_type_id),
      date: formatDate(row.worked_on),
      hours: money(row.hours),
      note: text(row.note),
    })),
    lines: lines.recordset.map((line) => ({
      employeeId: String(line.employee_id),
      employeeCode: line.employee_code,
      employeeName: line.employee_name,
      department: text(line.department),
      basicSalary: money(line.basic_salary),
      hourlyRate: money(line.hourly_rate),
      hours: money(line.hours),
      amount: money(line.amount),
      items: items.recordset
        .filter((item) => item.overtime_line_id === line.id)
        .map((item) => ({
          typeId: String(item.overtime_type_id),
          code: item.code,
          name: item.name,
          multiplier: money(item.multiplier),
          taxable: flag(item.taxable),
          hours: money(item.hours),
          amount: money(item.amount),
        })),
    })),
    excluded: excluded.recordset.map((row) => ({
      employeeId: String(row.employee_id),
      employeeName: row.employee_name,
      reason: row.reason === NO_SALARY ? NO_SALARY : row.reason,
    })),
    types: world.overtimeTypes,
    employees: world.employees
      .filter((employee) => employee.status === "Active")
      .map((employee) => ({
        id: Number(employee.id),
        code: world.employeeCodes.get(employee.id) ?? "",
        name: [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" "),
      })),
    monthly: monthly.recordset[0] ? { id: monthly.recordset[0].id, status: monthly.recordset[0].status } : null,
    standardMonthlyHours: world.overtimeSettings.standardMonthlyHours,
  };
}

async function rebuildOvertime(transaction: sql.Transaction, companyId: number, id: number, world: EngineWorld, entries: OvertimeEntry[], period: string) {
  const built = buildOvertimeLines({
    entries,
    employees: world.employees,
    profiles: world.profiles,
    types: world.overtimeTypes,
    settings: world.overtimeSettings,
  });
  await new sql.Request(transaction)
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, companyId)
    .query(`
      DELETE i FROM dbo.overtime_line_items AS i
      INNER JOIN dbo.overtime_lines AS l ON l.id = i.overtime_line_id AND l.company_id = i.company_id
      WHERE l.overtime_run_id = @id AND l.company_id = @companyId;
      DELETE FROM dbo.overtime_lines WHERE overtime_run_id = @id AND company_id = @companyId;
      DELETE FROM dbo.overtime_excluded WHERE overtime_run_id = @id AND company_id = @companyId;
    `);
  for (const line of built.lines) {
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, id)
      .input("employeeId", sql.Int, Number(line.employeeId))
      .input("employeeName", sql.NVarChar(300), line.employeeName)
      .input("department", sql.NVarChar(200), line.department)
      .input("basic", sql.Decimal(18, 2), line.basicSalary)
      .input("hourly", sql.Decimal(18, 2), line.hourlyRate)
      .input("hours", sql.Decimal(8, 2), line.hours)
      .input("amount", sql.Decimal(18, 2), line.amount)
      .query<{ id: number }>(`
        INSERT INTO dbo.overtime_lines (
          company_id, overtime_run_id, employee_id, employee_name, department, basic_salary, hourly_rate, hours, amount
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @runId, @employeeId, @employeeName, @department, @basic, @hourly, @hours, @amount)
      `);
    for (const item of line.items) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, companyId)
        .input("lineId", sql.Int, inserted.recordset[0].id)
        .input("typeId", sql.Int, Number(item.typeId))
        .input("code", sql.NVarChar(50), item.code)
        .input("name", sql.NVarChar(200), item.name)
        .input("multiplier", sql.Decimal(8, 4), item.multiplier)
        .input("taxable", sql.Bit, item.taxable)
        .input("hours", sql.Decimal(8, 2), item.hours)
        .input("amount", sql.Decimal(18, 2), item.amount)
        .query(`
          INSERT INTO dbo.overtime_line_items (
            company_id, overtime_line_id, overtime_type_id, code, name, multiplier, taxable, hours, amount
          )
          VALUES (@companyId, @lineId, @typeId, @code, @name, @multiplier, @taxable, @hours, @amount)
        `);
    }
  }
  for (const row of built.excluded) {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, companyId)
      .input("runId", sql.Int, id)
      .input("employeeId", sql.Int, Number(row.employeeId) || 0)
      .input("employeeName", sql.NVarChar(300), row.employeeName)
      .input("reason", sql.NVarChar(300), row.reason)
      .query(`
        INSERT INTO dbo.overtime_excluded (company_id, overtime_run_id, employee_id, employee_name, reason)
        VALUES (@companyId, @runId, @employeeId, @employeeName, @reason)
      `);
  }
  await new sql.Request(transaction)
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, companyId)
    .input("calculatedOn", sql.DateTime2, new Date())
    .query(`UPDATE dbo.overtime_runs SET calculated_on = @calculatedOn WHERE id = @id AND company_id = @companyId`);
  return period;
}

export async function saveOvertimeEntry(runId: number, values: { employeeId: number; typeId: number; date: string; hours: number; note: string }) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const header = await loaded.pool.request().input("id", sql.Int, runId).input("companyId", sql.Int, loaded.session.company.id).query<{ period: string; status: string }>(`
    SELECT period, status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  const run = header.recordset[0];
  if (!run || run.status !== "Draft") {
    return { error: "Only draft overtime sheets can be changed." };
  }
  const period = text(run.period).slice(0, 7);
  if (!values.employeeId) {
    return { error: "Choose an employee." };
  }
  if (!loaded.world.overtimeTypes.some((type) => type.id === String(values.typeId))) {
    return { error: "Choose an overtime rate." };
  }
  if (!values.date.startsWith(`${period}-`)) {
    return { error: `The date must be in ${formatPeriod(period)}.` };
  }
  if (!(values.hours > 0) || values.hours > 24) {
    return { error: "Hours must be more than 0 and no more than 24." };
  }
  const problem = overtimeReadiness(loaded.world.overtimeTypes, loaded.world.overtimeSettings)[0];
  if (problem) {
    return { error: problem };
  }
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("companyId", sql.Int, loaded.session.company.id)
      .input("runId", sql.Int, runId)
      .input("employeeId", sql.Int, values.employeeId)
      .input("typeId", sql.Int, values.typeId)
      .input("date", sql.Date, values.date)
      .input("hours", sql.Decimal(8, 2), values.hours)
      .input("note", sql.NVarChar(500), values.note.trim())
      .query(`
        INSERT INTO dbo.overtime_entries (company_id, overtime_run_id, employee_id, overtime_type_id, worked_on, hours, note)
        VALUES (@companyId, @runId, @employeeId, @typeId, @date, @hours, @note)
      `);
    const entries = await new sql.Request(transaction)
      .input("runId", sql.Int, runId)
      .input("companyId", sql.Int, loaded.session.company.id)
      .query<{ id: number; employee_id: number; overtime_type_id: number; worked_on: Date; hours: number; note: string }>(`
        SELECT id, employee_id, overtime_type_id, worked_on, hours, note
        FROM dbo.overtime_entries WHERE overtime_run_id = @runId AND company_id = @companyId
      `);
    await rebuildOvertime(
      transaction,
      loaded.session.company.id,
      runId,
      loaded.world,
      entries.recordset.map((row) => ({
        id: String(row.id),
        employeeId: String(row.employee_id),
        typeId: String(row.overtime_type_id),
        date: formatDate(row.worked_on),
        hours: money(row.hours),
        note: text(row.note),
      })),
      period,
    );
    await transaction.commit();
    return { id: runId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteOvertimeEntry(runId: number, entryId: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const header = await loaded.pool.request().input("id", sql.Int, runId).input("companyId", sql.Int, loaded.session.company.id).query<{ period: string; status: string }>(`
    SELECT period, status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  if (header.recordset[0]?.status !== "Draft") {
    return { error: "Only draft overtime sheets can be changed." };
  }
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("id", sql.Int, entryId)
      .input("runId", sql.Int, runId)
      .input("companyId", sql.Int, loaded.session.company.id)
      .query(`DELETE FROM dbo.overtime_entries WHERE id = @id AND overtime_run_id = @runId AND company_id = @companyId`);
    const entries = await new sql.Request(transaction)
      .input("runId", sql.Int, runId)
      .input("companyId", sql.Int, loaded.session.company.id)
      .query<{ id: number; employee_id: number; overtime_type_id: number; worked_on: Date; hours: number; note: string }>(`
        SELECT id, employee_id, overtime_type_id, worked_on, hours, note
        FROM dbo.overtime_entries WHERE overtime_run_id = @runId AND company_id = @companyId
      `);
    await rebuildOvertime(
      transaction,
      loaded.session.company.id,
      runId,
      loaded.world,
      entries.recordset.map((row) => ({
        id: String(row.id),
        employeeId: String(row.employee_id),
        typeId: String(row.overtime_type_id),
        date: formatDate(row.worked_on),
        hours: money(row.hours),
        note: text(row.note),
      })),
      text(header.recordset[0].period).slice(0, 7),
    );
    await transaction.commit();
    return { id: runId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function setOvertimePayPeriod(id: number, payPeriod: string) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const header = await loaded.pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{ period: string; status: string }>(`
    SELECT period, status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  const run = header.recordset[0];
  if (!run || run.status !== "Draft") {
    return { error: "Only draft overtime sheets can be changed." };
  }
  const period = text(run.period).slice(0, 7);
  const problem =
    (payPeriod < period ? "Overtime cannot be paid before the month it was worked." : "") ||
    monthlyBlocked(loaded.world, payPeriod, "overtime");
  if (problem) {
    return { error: problem };
  }
  await loaded.pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, loaded.session.company.id)
    .input("payPeriod", sql.Char(7), payPeriod)
    .query(`UPDATE dbo.overtime_runs SET pay_period = @payPeriod WHERE id = @id AND company_id = @companyId`);
  return { id };
}

export async function recalculateOvertimeRun(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const problem = overtimeReadiness(loaded.world.overtimeTypes, loaded.world.overtimeSettings)[0];
  if (problem) {
    return { error: problem };
  }
  const header = await loaded.pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{ period: string; status: string }>(`
    SELECT period, status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  if (header.recordset[0]?.status !== "Draft") {
    return { error: "Only draft overtime sheets can be recalculated." };
  }
  const entries = await loaded.pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{
    id: number;
    employee_id: number;
    overtime_type_id: number;
    worked_on: Date;
    hours: number;
    note: string;
  }>(`SELECT id, employee_id, overtime_type_id, worked_on, hours, note FROM dbo.overtime_entries WHERE overtime_run_id = @id AND company_id = @companyId`);
  const transaction = new sql.Transaction(loaded.pool);
  await transaction.begin();
  try {
    await rebuildOvertime(
      transaction,
      loaded.session.company.id,
      id,
      loaded.world,
      entries.recordset.map((row) => ({
        id: String(row.id),
        employeeId: String(row.employee_id),
        typeId: String(row.overtime_type_id),
        date: formatDate(row.worked_on),
        hours: money(row.hours),
        note: text(row.note),
      })),
      text(header.recordset[0].period).slice(0, 7),
    );
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function lockOvertimeRun(id: number) {
  const loaded = await worldForSession();
  if ("error" in loaded) {
    return loaded;
  }
  const header = await loaded.pool.request().input("id", sql.Int, id).input("companyId", sql.Int, loaded.session.company.id).query<{ pay_period: string; status: string }>(`
    SELECT pay_period, status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId
  `);
  const run = header.recordset[0];
  if (run?.status !== "Approved") {
    return { error: "Only approved overtime sheets can be locked." };
  }
  const blocked = monthlyBlocked(loaded.world, text(run.pay_period).slice(0, 7), "overtime");
  if (blocked) {
    return { error: `${blocked} Move it back to draft or pay the overtime in a later month.` };
  }
  return lockNamedRun("overtime_runs", id);
}

export async function deleteOvertimeRun(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query<{ status: string }>(`SELECT status FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId`);
    if (current.recordset[0]?.status !== "Draft") {
      await transaction.rollback();
      return { error: "Only a draft overtime sheet can be deleted." };
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`
        DELETE i FROM dbo.overtime_line_items AS i
        INNER JOIN dbo.overtime_lines AS l ON l.id = i.overtime_line_id AND l.company_id = i.company_id
        WHERE l.overtime_run_id = @id AND l.company_id = @companyId;
        DELETE FROM dbo.overtime_lines WHERE overtime_run_id = @id AND company_id = @companyId;
        DELETE FROM dbo.overtime_excluded WHERE overtime_run_id = @id AND company_id = @companyId;
        DELETE FROM dbo.overtime_entries WHERE overtime_run_id = @id AND company_id = @companyId;
        DELETE FROM dbo.overtime_runs WHERE id = @id AND company_id = @companyId;
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function listPayslips(list: PayrollListQuery & { employeeId: string; month: string; year: string }) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0, employees: [] as { id: number; name: string }[], years: [] as string[] };
  }
  const pool = await getPool();
  const search = `%${list.search.trim()}%`;
  const where = `
    FROM dbo.payroll_run_lines AS l
    INNER JOIN dbo.payroll_runs AS r ON r.id = l.payroll_run_id AND r.company_id = l.company_id
    INNER JOIN dbo.employees AS e ON e.id = l.employee_id AND e.company_id = l.company_id
    WHERE l.company_id = @companyId
      AND r.status IN (N'Approved', N'Locked')
      AND (@employeeId = 0 OR l.employee_id = @employeeId)
      AND (@year = N'' OR r.period LIKE @yearPrefix)
      AND (@month = N'' OR SUBSTRING(r.period, 6, 2) = @month)
      AND (@search = N'%%' OR l.employee_name LIKE @search OR e.employee_code LIKE @search OR l.department LIKE @search)
  `;
  const request = () =>
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, Number(list.employeeId) || 0)
      .input("year", sql.NVarChar(4), list.year)
      .input("yearPrefix", sql.NVarChar(6), list.year ? `${list.year}-%` : "")
      .input("month", sql.NVarChar(2), list.month)
      .input("search", sql.NVarChar(200), search);
  const count = await request().query<{ total: number }>(`SELECT COUNT(*) AS total ${where}`);
  const sort = orderBy(
    list.sortKey,
    list.sortDirection,
    {
      employeeName: "l.employee_name",
      employeeCode: "e.employee_code",
      department: "l.department",
      period: "r.period",
      netPay: "l.net_pay",
      runStatus: "r.status",
    },
    "r.period DESC, l.employee_name",
  );
  const order = list.sortKey ? sort : "r.period DESC, l.employee_name";
  const rows = await request()
    .input("offset", sql.Int, (list.page - 1) * list.pageSize)
    .input("pageSize", sql.Int, list.pageSize)
    .query<{
      run_id: number;
      employee_id: number;
      employee_code: string;
      employee_name: string;
      department: string;
      period: string;
      status: "Approved" | "Locked";
      net_pay: number;
      held: boolean;
    }>(`
      SELECT r.id AS run_id, l.employee_id, e.employee_code, l.employee_name, l.department, r.period, r.status, l.net_pay, l.held
      ${where}
      ORDER BY ${order}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  const people = await pool.request().input("companyId", sql.Int, session.company.id).query<{ id: number; name: string }>(`
    SELECT DISTINCT e.id, LTRIM(RTRIM(CONCAT(e.first_name, N' ', e.last_name))) AS name
    FROM dbo.payroll_run_lines AS l
    INNER JOIN dbo.payroll_runs AS r ON r.id = l.payroll_run_id AND r.company_id = l.company_id
    INNER JOIN dbo.employees AS e ON e.id = l.employee_id AND e.company_id = l.company_id
    WHERE l.company_id = @companyId AND r.status IN (N'Approved', N'Locked')
    ORDER BY name
  `);
  const years = await pool.request().input("companyId", sql.Int, session.company.id).query<{ year: string }>(`
    SELECT DISTINCT SUBSTRING(period, 1, 4) AS year
    FROM dbo.payroll_runs
    WHERE company_id = @companyId AND status IN (N'Approved', N'Locked')
    ORDER BY year DESC
  `);
  return {
    totalCount: count.recordset[0]?.total ?? 0,
    employees: people.recordset,
    years: years.recordset.map((row) => row.year),
    rows: rows.recordset.map((row) => ({
      key: `${row.run_id}:${row.employee_id}`,
      runId: row.run_id,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      department: text(row.department),
      period: text(row.period).slice(0, 7),
      runStatus: row.status,
      netPay: money(row.net_pay),
      held: flag(row.held),
    })),
  };
}

export async function getPayslipLines(keys: string[]) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const lines = [];
  for (const key of keys) {
    const [runId, employeeId] = key.split(":").map(Number);
    const detail = await getMonthlyRun(runId, "");
    if ("error" in detail) {
      continue;
    }
    const line = detail.run.lines.find((item) => item.employeeId === String(employeeId));
    if (line && (detail.run.status === "Approved" || detail.run.status === "Locked")) {
      lines.push({ ...line, period: detail.run.period, runStatus: detail.run.status, contributionColumns: detail.run.contributionColumns });
    }
  }
  return { lines };
}
