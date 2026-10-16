import "server-only";
import type { AccessAction } from "@/lib/access";
import { requireAnyFeature, requireFeature } from "./access";
import type {
  LeaveBalanceInput,
  LeaveBalanceListRow,
  LeaveBalanceRow,
  LeaveEmployeeOption,
} from "@/components/leave-balances/leave-balance.types";
import type { LeaveRequestRow } from "@/components/leave-requests/leave-request.types";
import {
  LEAVE_REQUEST_STATUSES,
  type LeaveRequestInput,
  type LeaveRequestListRow,
  type LeaveRequestStatus,
} from "@/components/leave-requests/leave-request.types";
import {
  countWorkingDays,
  daysTaken,
  entitlement,
  validateLeaveRequest,
} from "@/components/leave-requests/leave-calc";
import type { LeaveTypeRow } from "@/components/leave-types/leave-type.types";
import type {
  LeaveAppliesTo,
  LeaveDepartmentOption,
  LeaveEmployeeChoice,
  LeaveEmployeeFilter,
  LeavePaidUnpaid,
  LeaveTypeInput,
  LeaveTypeListRow,
  LeaveTypeOption,
} from "@/components/leave-types/leave-type.types";
import { getPool, sql } from "./db";
import type { SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

type ListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const EMPLOYEE_NAME = `LTRIM(RTRIM(CONCAT(e.first_name, N' ', CASE WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N'' ELSE e.middle_name + N' ' END, e.last_name)))`;

const TYPE_SORT: Record<string, string> = {
  leaveTypeName: "t.name",
  daysPerYear: "t.days_per_year",
  paidUnpaid: "t.paid_unpaid",
  appliesTo: "t.applies_to",
};

const BALANCE_ENTITLED = "COALESCE(o.entitled, t.days_per_year)";

const BALANCE_SORT: Record<string, string> = {
  employee: EMPLOYEE_NAME,
  leaveType: "t.name",
  year: "c.year",
  entitled: BALANCE_ENTITLED,
  taken: "ISNULL(usage.days, 0)",
  remaining: `(${BALANCE_ENTITLED} - ISNULL(usage.days, 0))`,
};

const REQUEST_SORT: Record<string, string> = {
  employee: EMPLOYEE_NAME,
  leaveType: "t.name",
  startDate: "r.start_date",
  endDate: "r.end_date",
  days: "r.days",
  status: "r.status",
  decidedBy: "ISNULL(NULLIF(u.full_name, N''), u.username)",
};

const NUMS = `
  WITH nums AS (
    SELECT 0 AS n
    UNION ALL
    SELECT n + 1 FROM nums WHERE n < 366
  )
`;

// Monday–Friday in UTC, matching countWorkingDays. 1970-01-01 is Thursday,
// so (day offset + 4) % 7 is the same as Date.getUTCDay (Sunday = 0).
const WORKING_DAY = `((DATEDIFF(DAY, CONVERT(date, '19700101'), DATEADD(DAY, nums.n, clip.clip_start)) + 4) % 7) NOT IN (0, 6)`;

const BALANCE_USAGE = `
  OUTER APPLY (
    SELECT SUM(wd.working_days) AS days
    FROM dbo.leave_requests AS r
    CROSS APPLY (
      SELECT
        CASE
          WHEN r.start_date > DATEFROMPARTS(c.year, 1, 1) THEN r.start_date
          ELSE DATEFROMPARTS(c.year, 1, 1)
        END AS clip_start,
        CASE
          WHEN r.end_date < DATEFROMPARTS(c.year, 12, 31) THEN r.end_date
          ELSE DATEFROMPARTS(c.year, 12, 31)
        END AS clip_end
    ) AS clip
    CROSS APPLY (
      SELECT COUNT(*) AS working_days
      FROM nums
      WHERE clip.clip_end >= clip.clip_start
        AND nums.n <= DATEDIFF(DAY, clip.clip_start, clip.clip_end)
        AND ${WORKING_DAY}
    ) AS wd
    WHERE r.company_id = @companyId
      AND r.employee_id = c.employee_id
      AND r.leave_type_id = c.leave_type_id
      AND r.status = N'Approved'
      AND r.start_date <= DATEFROMPARTS(c.year, 12, 31)
      AND r.end_date >= DATEFROMPARTS(c.year, 1, 1)
  ) AS usage
`;

const BALANCE_YEARS = `
  years AS (
    SELECT @year AS year
    WHERE @year IS NOT NULL
    UNION
    SELECT @focus AS year
    WHERE @year IS NULL
    UNION
    SELECT b.year
    FROM dbo.leave_balances AS b
    WHERE @year IS NULL AND b.company_id = @companyId
    UNION
    SELECT YEAR(r.start_date)
    FROM dbo.leave_requests AS r
    WHERE @year IS NULL AND r.company_id = @companyId AND r.status = N'Approved'
    UNION
    SELECT YEAR(r.end_date)
    FROM dbo.leave_requests AS r
    WHERE @year IS NULL AND r.company_id = @companyId AND r.status = N'Approved'
  ),
  covered AS (
    SELECT y.year, t.id AS leave_type_id, e.id AS employee_id
    FROM years AS y
    INNER JOIN dbo.leave_types AS t ON t.company_id = @companyId
    INNER JOIN dbo.employees AS e ON e.company_id = @companyId
    WHERE (
      (@year IS NOT NULL OR y.year = @focus)
      AND (
        (t.applies_to = N'Everyone' AND e.status = N'Active')
        OR (
          t.applies_to = N'Assign as needed'
          AND EXISTS (
            SELECT 1
            FROM dbo.leave_type_employees AS a
            WHERE a.leave_type_id = t.id AND a.company_id = t.company_id AND a.employee_id = e.id
          )
        )
        OR (
          e.status <> N'Active'
          AND (
            EXISTS (
              SELECT 1
              FROM dbo.leave_balances AS ob
              WHERE ob.company_id = @companyId
                AND ob.leave_type_id = t.id
                AND ob.employee_id = e.id
                AND ob.year = y.year
            )
            OR EXISTS (
              SELECT 1
              FROM dbo.leave_requests AS rq
              WHERE rq.company_id = @companyId
                AND rq.leave_type_id = t.id
                AND rq.employee_id = e.id
                AND rq.status = N'Approved'
                AND rq.start_date <= DATEFROMPARTS(y.year, 12, 31)
                AND rq.end_date >= DATEFROMPARTS(y.year, 1, 1)
            )
            OR (
              t.applies_to = N'Everyone'
              AND EXISTS (
                SELECT 1
                FROM dbo.leave_type_employees AS a2
                WHERE a2.leave_type_id = t.id AND a2.company_id = t.company_id AND a2.employee_id = e.id
              )
            )
          )
        )
      )
    )
    OR (
      @year IS NULL
      AND y.year <> @focus
      AND (
        EXISTS (
          SELECT 1
          FROM dbo.leave_balances AS ob2
          WHERE ob2.company_id = @companyId
            AND ob2.leave_type_id = t.id
            AND ob2.employee_id = e.id
            AND ob2.year = y.year
        )
        OR EXISTS (
          SELECT 1
          FROM dbo.leave_requests AS rq2
          WHERE rq2.company_id = @companyId
            AND rq2.leave_type_id = t.id
            AND rq2.employee_id = e.id
            AND rq2.status = N'Approved'
            AND rq2.start_date <= DATEFROMPARTS(y.year, 12, 31)
            AND rq2.end_date >= DATEFROMPARTS(y.year, 1, 1)
        )
      )
    )
  )
`;

const BALANCE_COUNT_FROM = `
  FROM covered AS c
  INNER JOIN dbo.employees AS e
    ON e.id = c.employee_id AND e.company_id = @companyId
  INNER JOIN dbo.leave_types AS t
    ON t.id = c.leave_type_id AND t.company_id = @companyId
`;

const BALANCE_FROM = `
  FROM covered AS c
  INNER JOIN dbo.employees AS e
    ON e.id = c.employee_id AND e.company_id = @companyId
  INNER JOIN dbo.leave_types AS t
    ON t.id = c.leave_type_id AND t.company_id = @companyId
  LEFT JOIN dbo.leave_balances AS o
    ON o.company_id = @companyId
    AND o.employee_id = c.employee_id
    AND o.leave_type_id = c.leave_type_id
    AND o.year = c.year
  ${BALANCE_USAGE}
`;

const BALANCE_SEARCH = `
        AND (
          @search = N'%%'
          OR ${EMPLOYEE_NAME} LIKE @search
          OR e.employee_code LIKE @search
          OR t.name LIKE @search
          OR CONVERT(nvarchar(10), c.year) LIKE @search
        )
`;

const REQUEST_FROM = `
  FROM dbo.leave_requests AS r
  INNER JOIN dbo.employees AS e
    ON e.id = r.employee_id AND e.company_id = r.company_id
  INNER JOIN dbo.leave_types AS t
    ON t.id = r.leave_type_id AND t.company_id = r.company_id
  LEFT JOIN dbo.users AS u
    ON u.id = r.decided_by
`;

const REQUEST_SEARCH = `
        AND (
          @search = N'%%'
          OR ${EMPLOYEE_NAME} LIKE @search
          OR e.employee_code LIKE @search
          OR t.name LIKE @search
          OR r.status LIKE @search
          OR r.note LIKE @search
          OR CONVERT(varchar(10), r.start_date, 23) LIKE @search
          OR CONVERT(varchar(10), r.end_date, 23) LIKE @search
        )
`;

type TypeSqlRow = {
  id: number;
  name: string;
  days_per_year: number;
  paid_unpaid: LeavePaidUnpaid;
  applies_to: LeaveAppliesTo;
};

type BalanceSqlRow = {
  override_id: number | null;
  employee_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employee_code: string;
  leave_type_id: number;
  leave_type_name: string;
  year: number;
  days_per_year: number;
  entitled: number | string;
  taken: number | null;
};

type RequestSqlRow = {
  id: number;
  employee_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employee_code: string;
  leave_type_id: number;
  leave_type_name: string;
  start_date: Date | string;
  end_date: Date | string;
  days: number;
  note: string;
  status: LeaveRequestStatus;
  decided_by_name: string | null;
  decided_on: Date | string | null;
};

type CalcRequestSqlRow = {
  id: number;
  employee_id: number;
  leave_type_id: number;
  start_date: Date | string;
  end_date: Date | string;
  days: number;
  note: string;
  status: LeaveRequestStatus;
  decided_by: number | null;
  decided_on: Date | string | null;
};

type CalcBalanceSqlRow = {
  id: number;
  employee_id: number;
  leave_type_id: number;
  year: number;
  entitled: number | string;
};

function requireCompany(feature: string, action: AccessAction) {
  return requireFeature(feature, action);
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

function formatDate(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function employeeName(row: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}) {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function asNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function roundDays(value: number) {
  return Math.round(value * 100) / 100;
}

function directionOf(value: "asc" | "desc") {
  return value === "desc" ? "DESC" : "ASC";
}

function isPaid(value: string): value is LeavePaidUnpaid {
  return value === "Paid" || value === "Unpaid";
}

function isApplies(value: string): value is LeaveAppliesTo {
  return value === "Everyone" || value === "Assign as needed";
}

function isStatus(value: string): value is LeaveRequestStatus {
  return (LEAVE_REQUEST_STATUSES as readonly string[]).includes(value);
}

function coveredForRequest(
  appliesTo: LeaveAppliesTo,
  status: string,
  assigned: boolean,
  hasOverride: boolean,
) {
  if (appliesTo === "Assign as needed") {
    return assigned;
  }
  if (status === "Active") {
    return true;
  }
  return assigned || hasOverride;
}

function duplicateTypeMessage(name: string) {
  return `A leave type called "${name}" already exists.`;
}

function duplicateBalanceMessage(year: number) {
  return `This employee already has a ${year} balance for this leave type. Edit that one instead.`;
}

function mapType(row: TypeSqlRow, employeeIds: number[] = []): LeaveTypeListRow {
  return {
    id: row.id,
    name: row.name,
    daysPerYear: row.days_per_year,
    paidUnpaid: row.paid_unpaid,
    appliesTo: row.applies_to,
    employeeIds,
  };
}

function mapBalance(row: BalanceSqlRow): LeaveBalanceListRow {
  const entitled = asNumber(row.entitled);
  const taken = row.taken ?? 0;
  return {
    overrideId: row.override_id,
    employeeId: row.employee_id,
    employeeName: employeeName(row),
    employeeCode: row.employee_code,
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type_name,
    year: row.year,
    entitled,
    daysPerYear: row.days_per_year,
    taken,
    remaining: roundDays(entitled - taken),
  };
}

function mapRequest(row: RequestSqlRow): LeaveRequestListRow {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: employeeName(row),
    employeeCode: row.employee_code,
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type_name,
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    days: row.days,
    note: row.note,
    status: row.status,
    decidedByName: row.decided_by_name ?? "",
    decidedOn: row.decided_on ? formatDate(row.decided_on) : "",
  };
}

function toCalcRequest(row: CalcRequestSqlRow): LeaveRequestRow {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    leaveTypeId: String(row.leave_type_id),
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    days: row.days,
    note: row.note,
    status: row.status,
    decidedBy: row.decided_by ? String(row.decided_by) : "",
    decidedOn: row.decided_on ? formatDate(row.decided_on) : "",
  };
}

function toCalcBalance(row: CalcBalanceSqlRow): LeaveBalanceRow {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    leaveTypeId: String(row.leave_type_id),
    year: row.year,
    entitled: asNumber(row.entitled),
  };
}

function toCalcType(row: TypeSqlRow): LeaveTypeRow {
  return {
    id: String(row.id),
    leaveTypeName: row.name,
    daysPerYear: row.days_per_year,
    paidUnpaid: row.paid_unpaid,
    appliesTo: row.applies_to,
  };
}

function validateType(input: LeaveTypeInput) {
  const name = input.name.trim();
  const days = input.daysPerYear;
  const paid = input.paidUnpaid;
  const applies = input.appliesTo;
  if (!name || days === null || !paid || !applies) {
    return { error: "All fields are required." };
  }
  if (name.length > 200) {
    return { error: "Leave type name must be 200 characters or fewer." };
  }
  if (!Number.isInteger(days) || days < 0 || days > 366) {
    return { error: "Days per year must be a whole number between 0 and 366." };
  }
  if (!isPaid(paid) || !isApplies(applies)) {
    return { error: "All fields are required." };
  }
  const employeeIds = [...new Set((input.employeeIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
  if (applies === "Assign as needed" && employeeIds.length === 0) {
    return { error: "Choose at least one employee." };
  }
  return {
    name,
    daysPerYear: days,
    paidUnpaid: paid,
    appliesTo: applies,
    employeeIds: applies === "Assign as needed" ? employeeIds : [],
  };
}

function validateBalance(input: LeaveBalanceInput) {
  const year = input.year;
  const entitled = input.entitled;
  if (!input.employeeId || !input.leaveTypeId || entitled === null) {
    return { error: "Employee, leave type and entitled days are required." };
  }
  if (year === null || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Enter a valid year." };
  }
  if (typeof entitled !== "number" || !Number.isFinite(entitled) || entitled < 0 || entitled > 366) {
    return { error: "Entitled days must be between 0 and 366." };
  }
  return {
    employeeId: input.employeeId,
    leaveTypeId: input.leaveTypeId,
    year,
    entitled,
  };
}

function validateRequestShape(input: LeaveRequestInput) {
  const note = input.note.trim();
  if (!input.employeeId || !input.leaveTypeId || !input.startDate || !input.endDate) {
    return { error: "Employee, leave type, start and end date are required." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { error: "Employee, leave type, start and end date are required." };
  }
  if (note.length > 1000) {
    return { error: "Note must be 1000 characters or fewer." };
  }
  return {
    employeeId: input.employeeId,
    leaveTypeId: input.leaveTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    note,
    days: countWorkingDays(input.startDate, input.endDate),
  };
}

async function requestProblems(
  runner: sql.Transaction,
  companyId: number,
  input: {
    employeeId: number;
    leaveTypeId: number;
    startDate: string;
    endDate: string;
  },
  excludeId: number | null,
) {
  const employee = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("employeeId", sql.Int, input.employeeId)
    .query<{ id: number; status: string }>(`
      SELECT e.id, e.status
      FROM dbo.employees AS e
      WHERE e.id = @employeeId AND e.company_id = @companyId
    `);
  const typeResult = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("leaveTypeId", sql.Int, input.leaveTypeId)
    .query<TypeSqlRow>(`
      SELECT id, name, days_per_year, paid_unpaid, applies_to
      FROM dbo.leave_types
      WHERE id = @leaveTypeId AND company_id = @companyId
    `);
  const balanceResult = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("employeeId", sql.Int, input.employeeId)
    .input("leaveTypeId", sql.Int, input.leaveTypeId)
    .query<CalcBalanceSqlRow>(`
      SELECT id, employee_id, leave_type_id, year, entitled
      FROM dbo.leave_balances
      WHERE company_id = @companyId
        AND employee_id = @employeeId
        AND leave_type_id = @leaveTypeId
    `);
  const requestResult = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("employeeId", sql.Int, input.employeeId)
    .query<CalcRequestSqlRow>(`
      SELECT
        id, employee_id, leave_type_id, start_date, end_date, days, note,
        status, decided_by, decided_on
      FROM dbo.leave_requests
      WHERE company_id = @companyId AND employee_id = @employeeId
    `);

  const person = employee.recordset[0];
  if (!person) {
    return { error: "Employee not found." };
  }
  const type = typeResult.recordset[0];
  if (!type) {
    return { error: "Leave type not found." };
  }
  const assignment = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("employeeId", sql.Int, input.employeeId)
    .input("leaveTypeId", sql.Int, input.leaveTypeId)
    .query<{ employee_id: number }>(`
      SELECT employee_id
      FROM dbo.leave_type_employees
      WHERE company_id = @companyId
        AND leave_type_id = @leaveTypeId
        AND employee_id = @employeeId
    `);
  const assigned = Boolean(assignment.recordset[0]);
  const balances = balanceResult.recordset.map(toCalcBalance);
  const overrideYears = new Set(
    balances
      .filter((item) => item.leaveTypeId === String(input.leaveTypeId))
      .map((item) => item.year),
  );

  const problems = validateLeaveRequest(
    {
      id: excludeId ? String(excludeId) : undefined,
      employeeId: String(input.employeeId),
      leaveTypeId: String(input.leaveTypeId),
      startDate: input.startDate,
      endDate: input.endDate,
    },
    {
      requests: requestResult.recordset.map(toCalcRequest),
      balances,
      leaveTypes: [toCalcType(type)],
      assigned,
      coveredYear: (year) => coveredForRequest(type.applies_to, person.status, assigned, overrideYears.has(year)),
    },
  );
  if (problems.length > 0) {
    return { error: problems.join(" ") };
  }
  return { ok: true as const };
}

export async function listLeaveFormOptions() {
  const session = await requireAnyFeature([
    { feature: "leaveTypes", action: "view" },
    { feature: "leaveRequests", action: "view" },
    { feature: "leaveBalances", action: "view" },
  ]);
  if ("error" in session) {
    return {
      leaveTypes: [] as LeaveTypeOption[],
      employees: [] as LeaveEmployeeOption[],
      departments: [] as LeaveDepartmentOption[],
    };
  }
  const pool = await getPool();
  const [types, employees, departments] = await Promise.all([
    pool.request().input("companyId", sql.Int, session.company.id).query<TypeSqlRow>(`
      SELECT id, name, days_per_year, paid_unpaid, applies_to
      FROM dbo.leave_types
      WHERE company_id = @companyId
      ORDER BY name, id
    `),
    pool.request().input("companyId", sql.Int, session.company.id).query<{
      id: number;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      employee_code: string;
    }>(`
      SELECT id, first_name, middle_name, last_name, employee_code
      FROM dbo.employees
      WHERE company_id = @companyId AND status = N'Active'
      ORDER BY last_name, first_name, id
    `),
    pool.request().input("companyId", sql.Int, session.company.id).query<LeaveDepartmentOption>(`
      SELECT id, name
      FROM dbo.departments
      WHERE company_id = @companyId AND is_active = 1
      ORDER BY name, id
    `),
  ]);
  return {
    leaveTypes: types.recordset.map((row) => mapType(row)),
    employees: employees.recordset.map((employee) => ({
      id: employee.id,
      name: employeeName(employee),
      employeeCode: employee.employee_code,
    })),
    departments: departments.recordset,
  };
}

const NO_DEPARTMENT = "No department";

export async function listLeaveEmployees(query: LeaveEmployeeFilter): Promise<LeaveEmployeeChoice[]> {
  const session = await requireCompany("leaveTypes", "view");
  if ("error" in session) {
    return [];
  }
  const includeIds = (Array.isArray(query.includeIds) ? query.includeIds : []).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const filter = query.filter === "none" || query.filter === "department" ? query.filter : "all";
  const departmentId = Number.isInteger(query.departmentId) ? query.departmentId : null;
  const search = `%${(query.search ?? "").trim()}%`;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("filter", sql.NVarChar(20), filter)
    .input("departmentId", sql.Int, departmentId)
    .input("includeIds", sql.NVarChar(sql.MAX), JSON.stringify(includeIds))
    .input("search", sql.NVarChar(400), search)
    .query<{
      id: number;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      employee_code: string;
      department_id: number | null;
      department_name: string | null;
    }>(`
      SELECT
        e.id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.employee_code,
        e.department_id,
        d.name AS department_name
      FROM dbo.employees AS e
      LEFT JOIN dbo.departments AS d
        ON d.id = e.department_id AND d.company_id = e.company_id
      WHERE e.company_id = @companyId
        AND (
          e.status = N'Active'
          OR e.id IN (SELECT CAST(ids.[value] AS int) FROM OPENJSON(@includeIds) AS ids)
        )
        AND (
          @filter = N'all'
          OR (@filter = N'none' AND e.department_id IS NULL)
          OR (
            @filter = N'department'
            AND @departmentId IS NOT NULL
            AND e.department_id = @departmentId
            AND EXISTS (
              SELECT 1
              FROM dbo.departments AS dept
              WHERE dept.id = @departmentId AND dept.company_id = @companyId
            )
          )
        )
        AND (
          @search = N'%%'
          OR e.first_name LIKE @search
          OR ISNULL(e.middle_name, N'') LIKE @search
          OR e.last_name LIKE @search
          OR e.employee_code LIKE @search
          OR ${EMPLOYEE_NAME} LIKE @search
        )
      ORDER BY e.last_name, e.first_name, e.id
    `);
  return result.recordset.map((employee) => ({
    id: employee.id,
    name: employeeName(employee),
    employeeCode: employee.employee_code,
    departmentId: employee.department_id,
    departmentName: employee.department_name ?? NO_DEPARTMENT,
  }));
}

export async function listRequestLeaveTypes(employeeId: number, includeTypeId: number | null) {
  const session = await requireCompany("leaveRequests", "view");
  if ("error" in session) {
    return [] as LeaveTypeOption[];
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, employeeId)
    .input("includeTypeId", sql.Int, includeTypeId)
    .query<TypeSqlRow>(`
      SELECT t.id, t.name, t.days_per_year, t.paid_unpaid, t.applies_to
      FROM dbo.leave_types AS t
      WHERE t.company_id = @companyId
        AND (
          t.applies_to = N'Everyone'
          OR t.id = @includeTypeId
          OR EXISTS (
            SELECT 1
            FROM dbo.leave_type_employees AS a
            WHERE a.leave_type_id = t.id
              AND a.company_id = t.company_id
              AND a.employee_id = @employeeId
          )
        )
      ORDER BY t.name, t.id
    `);
  return result.recordset.map((row) => mapType(row));
}

export async function listLeaveBalanceYears() {
  const session = await requireCompany("leaveBalances", "view");
  if ("error" in session) {
    return [] as number[];
  }
  const pool = await getPool();
  const result = await pool.request().input("companyId", sql.Int, session.company.id).query<{ year: number }>(`
    SELECT DISTINCT year
    FROM (
      SELECT year
      FROM dbo.leave_balances
      WHERE company_id = @companyId
      UNION
      SELECT YEAR(start_date)
      FROM dbo.leave_requests
      WHERE company_id = @companyId
        AND status = N'Approved'
      UNION
      SELECT YEAR(end_date)
      FROM dbo.leave_requests
      WHERE company_id = @companyId
        AND status = N'Approved'
    ) AS years
    ORDER BY year DESC
  `);
  return result.recordset.map((row) => row.year);
}

export async function leaveRemaining(query: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  excludeRequestId: number | null;
}) {
  const session = await requireCompany("leaveRequests", "view");
  if ("error" in session) {
    return { remaining: null as number | null };
  }
  if (!Number.isInteger(query.year)) {
    return { remaining: null };
  }
  const pool = await getPool();
  const [typeResult, balanceResult, requestResult, personResult, assignmentResult] = await Promise.all([
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("leaveTypeId", sql.Int, query.leaveTypeId)
      .query<TypeSqlRow>(`
        SELECT id, name, days_per_year, paid_unpaid, applies_to
        FROM dbo.leave_types
        WHERE id = @leaveTypeId AND company_id = @companyId
      `),
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, query.employeeId)
      .input("leaveTypeId", sql.Int, query.leaveTypeId)
      .query<CalcBalanceSqlRow>(`
        SELECT id, employee_id, leave_type_id, year, entitled
        FROM dbo.leave_balances
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND leave_type_id = @leaveTypeId
      `),
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, query.employeeId)
      .query<CalcRequestSqlRow>(`
        SELECT
          id, employee_id, leave_type_id, start_date, end_date, days, note,
          status, decided_by, decided_on
        FROM dbo.leave_requests
        WHERE company_id = @companyId AND employee_id = @employeeId
      `),
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, query.employeeId)
      .query<{ status: string }>(`
        SELECT status FROM dbo.employees WHERE id = @employeeId AND company_id = @companyId
      `),
    pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, query.employeeId)
      .input("leaveTypeId", sql.Int, query.leaveTypeId)
      .query<{ employee_id: number }>(`
        SELECT employee_id
        FROM dbo.leave_type_employees
        WHERE company_id = @companyId AND leave_type_id = @leaveTypeId AND employee_id = @employeeId
      `),
  ]);
  const type = typeResult.recordset[0];
  const person = personResult.recordset[0];
  if (!type || !person) {
    return { remaining: null };
  }
  const balances = balanceResult.recordset.map(toCalcBalance);
  const assigned = Boolean(assignmentResult.recordset[0]);
  const hasOverride = balances.some((item) => item.year === query.year);
  const allowed = entitlement(
    balances,
    [toCalcType(type)],
    String(query.employeeId),
    String(query.leaveTypeId),
    query.year,
    assigned,
    coveredForRequest(type.applies_to, person.status, assigned, hasOverride),
  );
  if (allowed === null) {
    return { remaining: null };
  }
  const requests = requestResult.recordset.map(toCalcRequest);
  const taken = daysTaken(
    requests,
    String(query.employeeId),
    String(query.leaveTypeId),
    query.year,
    query.excludeRequestId ? String(query.excludeRequestId) : undefined,
  );
  return { remaining: roundDays(allowed - taken) };
}

export async function listLeaveTypes(query: ListQuery) {
  const session = await requireCompany("leaveTypes", "view");
  if ("error" in session) {
    return { rows: [] as LeaveTypeListRow[], totalCount: 0 };
  }
  const sortColumn = TYPE_SORT[query.sortKey] ?? TYPE_SORT.leaveTypeName;
  const direction = directionOf(query.sortDirection);
  const search = `%${query.search.trim()}%`;
  const offset = (query.page - 1) * query.pageSize;
  const pool = await getPool();
  const request = pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search);
  const countResult = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS total
    FROM dbo.leave_types AS t
    WHERE t.company_id = @companyId
      AND (
        @search = N'%%'
        OR t.name LIKE @search
        OR t.paid_unpaid LIKE @search
        OR t.applies_to LIKE @search
      )
  `);
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<TypeSqlRow>(`
      SELECT t.id, t.name, t.days_per_year, t.paid_unpaid, t.applies_to
      FROM dbo.leave_types AS t
      WHERE t.company_id = @companyId
        AND (
          @search = N'%%'
          OR t.name LIKE @search
          OR t.paid_unpaid LIKE @search
          OR t.applies_to LIKE @search
        )
      ORDER BY ${sortColumn} ${direction}, t.id ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  const assigned = await assignmentMap(
    session.company.id,
    listResult.recordset.map((row) => row.id),
  );
  return {
    rows: listResult.recordset.map((row) => mapType(row, assigned.get(row.id) ?? [])),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listLeaveTypesForExport(query: Omit<ListQuery, "page" | "pageSize">) {
  const session = await requireCompany("leaveTypes", "view");
  if ("error" in session) {
    return [] as LeaveTypeListRow[];
  }
  const sortColumn = TYPE_SORT[query.sortKey] ?? TYPE_SORT.leaveTypeName;
  const direction = directionOf(query.sortDirection);
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .query<TypeSqlRow>(`
      SELECT t.id, t.name, t.days_per_year, t.paid_unpaid, t.applies_to
      FROM dbo.leave_types AS t
      WHERE t.company_id = @companyId
        AND (
          @search = N'%%'
          OR t.name LIKE @search
          OR t.paid_unpaid LIKE @search
          OR t.applies_to LIKE @search
        )
      ORDER BY ${sortColumn} ${direction}, t.id ASC
    `);
  return result.recordset.map((row) => mapType(row));
}

async function employeesInCompany(runner: sql.Transaction, companyId: number, employeeIds: number[]) {
  if (employeeIds.length === 0) {
    return true;
  }
  const result = await new sql.Request(runner)
    .input("companyId", sql.Int, companyId)
    .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(employeeIds))
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM dbo.employees
      WHERE company_id = @companyId
        AND id IN (SELECT CAST([value] AS int) FROM OPENJSON(@ids))
    `);
  return result.recordset[0]?.total === employeeIds.length;
}

async function replaceAssignments(
  runner: sql.Transaction,
  companyId: number,
  leaveTypeId: number,
  employeeIds: number[],
) {
  await new sql.Request(runner)
    .input("leaveTypeId", sql.Int, leaveTypeId)
    .input("companyId", sql.Int, companyId)
    .query(`
      DELETE FROM dbo.leave_type_employees
      WHERE leave_type_id = @leaveTypeId AND company_id = @companyId
    `);
  for (const employeeId of employeeIds) {
    await new sql.Request(runner)
      .input("leaveTypeId", sql.Int, leaveTypeId)
      .input("companyId", sql.Int, companyId)
      .input("employeeId", sql.Int, employeeId)
      .query(`
        INSERT INTO dbo.leave_type_employees (leave_type_id, company_id, employee_id)
        VALUES (@leaveTypeId, @companyId, @employeeId)
      `);
  }
}

async function findDuplicateType(companyId: number, name: string, excludeId: number) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("name", sql.NVarChar(200), name)
    .input("excludeId", sql.Int, excludeId)
    .query<{ id: number }>(`
      SELECT id
      FROM dbo.leave_types
      WHERE company_id = @companyId
        AND LOWER(name) = LOWER(@name)
        AND id <> @excludeId
    `);
  return result.recordset[0] ?? null;
}

export async function createLeaveType(input: LeaveTypeInput) {
  const session = await requireCompany("leaveTypes", "create");
  if ("error" in session) {
    return session;
  }
  const parsed = validateType(input);
  if ("error" in parsed) {
    return parsed;
  }
  const duplicate = await findDuplicateType(session.company.id, parsed.name, 0);
  if (duplicate) {
    return { error: duplicateTypeMessage(parsed.name) };
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const known = await employeesInCompany(transaction, session.company.id, parsed.employeeIds);
    if (!known) {
      await transaction.rollback();
      return { error: "Employee not found." };
    }
    const result = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("name", sql.NVarChar(200), parsed.name)
      .input("days", sql.Int, parsed.daysPerYear)
      .input("paid", sql.NVarChar(20), parsed.paidUnpaid)
      .input("applies", sql.NVarChar(30), parsed.appliesTo)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.leave_types (
          company_id, name, days_per_year, paid_unpaid, applies_to, created_by, updated_by
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, @days, @paid, @applies, @actorId, @actorId)
      `);
    const id = result.recordset[0].id;
    await replaceAssignments(transaction, session.company.id, id, parsed.employeeIds);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: duplicateTypeMessage(parsed.name) };
    }
    throw error;
  }
}

export async function updateLeaveType(id: number, input: LeaveTypeInput) {
  const session = await requireCompany("leaveTypes", "edit");
  if ("error" in session) {
    return session;
  }
  const parsed = validateType(input);
  if ("error" in parsed) {
    return parsed;
  }
  const duplicate = await findDuplicateType(session.company.id, parsed.name, id);
  if (duplicate) {
    return { error: duplicateTypeMessage(parsed.name) };
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const known = await employeesInCompany(transaction, session.company.id, parsed.employeeIds);
    if (!known) {
      await transaction.rollback();
      return { error: "Employee not found." };
    }
    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("name", sql.NVarChar(200), parsed.name)
      .input("days", sql.Int, parsed.daysPerYear)
      .input("paid", sql.NVarChar(20), parsed.paidUnpaid)
      .input("applies", sql.NVarChar(30), parsed.appliesTo)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.leave_types
        SET
          name = @name,
          days_per_year = @days,
          paid_unpaid = @paid,
          applies_to = @applies,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Leave type not found." };
    }
    await replaceAssignments(transaction, session.company.id, id, parsed.employeeIds);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: duplicateTypeMessage(parsed.name) };
    }
    throw error;
  }
}

export async function deleteLeaveType(id: number) {
  const session = await requireCompany("leaveTypes", "delete");
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const existing = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query<{ name: string }>(`
      SELECT name
      FROM dbo.leave_types
      WHERE id = @id AND company_id = @companyId
    `);
  const row = existing.recordset[0];
  if (!row) {
    return { error: "Leave type not found." };
  }
  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`
        DELETE FROM dbo.leave_types
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.rowsAffected[0]) {
      return { error: "Leave type not found." };
    }
    return { id };
  } catch (error) {
    if (isForeignKeyError(error)) {
      return { error: `${row.name} cannot be deleted because leave requests or balances use it.` };
    }
    throw error;
  }
}

function balanceRequest(
  pool: sql.ConnectionPool,
  companyId: number,
  search: string,
  year: number | null,
  focus: number,
) {
  return pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("search", sql.NVarChar(400), search)
    .input("year", sql.Int, year)
    .input("focus", sql.Int, focus);
}

const BALANCE_WHERE = `
  WHERE 1 = 1
    ${BALANCE_SEARCH}
`;

function currentUtcYear() {
  return Number(new Date().toISOString().slice(0, 4));
}

async function assignmentMap(companyId: number, typeIds: number[]) {
  const map = new Map<number, number[]>();
  if (typeIds.length === 0) {
    return map;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(typeIds))
    .query<{ leave_type_id: number; employee_id: number }>(`
      SELECT leave_type_id, employee_id
      FROM dbo.leave_type_employees
      WHERE company_id = @companyId
        AND leave_type_id IN (SELECT CAST([value] AS int) FROM OPENJSON(@ids))
    `);
  for (const row of result.recordset) {
    const list = map.get(row.leave_type_id) ?? [];
    list.push(row.employee_id);
    map.set(row.leave_type_id, list);
  }
  return map;
}

export async function listLeaveBalances(query: ListQuery & { year: number | null }) {
  const session = await requireCompany("leaveBalances", "view");
  if ("error" in session) {
    return { rows: [] as LeaveBalanceListRow[], totalCount: 0 };
  }
  const sortColumn = BALANCE_SORT[query.sortKey] ?? BALANCE_SORT.employee;
  const direction = directionOf(query.sortDirection);
  const search = `%${query.search.trim()}%`;
  const offset = (query.page - 1) * query.pageSize;
  const focus = currentUtcYear();
  const pool = await getPool();
  const countResult = await balanceRequest(pool, session.company.id, search, query.year, focus).query<{ total: number }>(`
    WITH ${BALANCE_YEARS}
    SELECT COUNT(*) AS total
    ${BALANCE_COUNT_FROM}
    ${BALANCE_WHERE}
  `);
  const listResult = await balanceRequest(pool, session.company.id, search, query.year, focus)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<BalanceSqlRow>(`
      ${NUMS},
      ${BALANCE_YEARS}
      SELECT
        o.id AS override_id,
        c.employee_id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.employee_code,
        c.leave_type_id,
        t.name AS leave_type_name,
        c.year,
        t.days_per_year,
        ${BALANCE_ENTITLED} AS entitled,
        ISNULL(usage.days, 0) AS taken
      ${BALANCE_FROM}
      ${BALANCE_WHERE}
      ORDER BY ${sortColumn} ${direction}, c.employee_id ASC, c.leave_type_id ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      OPTION (MAXRECURSION 366)
    `);
  return {
    rows: listResult.recordset.map(mapBalance),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listLeaveBalancesForExport(
  query: Omit<ListQuery, "page" | "pageSize"> & { year: number | null },
) {
  const session = await requireCompany("leaveBalances", "view");
  if ("error" in session) {
    return [] as LeaveBalanceListRow[];
  }
  const sortColumn = BALANCE_SORT[query.sortKey] ?? BALANCE_SORT.employee;
  const direction = directionOf(query.sortDirection);
  const search = `%${query.search.trim()}%`;
  const focus = currentUtcYear();
  const pool = await getPool();
  const result = await balanceRequest(pool, session.company.id, search, query.year, focus).query<BalanceSqlRow>(`
    ${NUMS},
    ${BALANCE_YEARS}
    SELECT
      o.id AS override_id,
      c.employee_id,
      e.first_name,
      e.middle_name,
      e.last_name,
      e.employee_code,
      c.leave_type_id,
      t.name AS leave_type_name,
      c.year,
      t.days_per_year,
      ${BALANCE_ENTITLED} AS entitled,
      ISNULL(usage.days, 0) AS taken
    ${BALANCE_FROM}
    ${BALANCE_WHERE}
    ORDER BY ${sortColumn} ${direction}, c.employee_id ASC, c.leave_type_id ASC
    OPTION (MAXRECURSION 366)
  `);
  return result.recordset.map(mapBalance);
}

export async function updateLeaveBalance(input: LeaveBalanceInput) {
  const session = await requireCompany("leaveBalances", "edit");
  if ("error" in session) {
    return session;
  }
  const parsed = validateBalance(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const type = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
    .query<{ days_per_year: number }>(`
      SELECT days_per_year FROM dbo.leave_types WHERE id = @leaveTypeId AND company_id = @companyId
    `);
  const leaveType = type.recordset[0];
  if (!leaveType) {
    return { error: "Leave type not found." };
  }
  const employee = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("employeeId", sql.Int, parsed.employeeId)
    .query<{ id: number }>(`
      SELECT id FROM dbo.employees WHERE id = @employeeId AND company_id = @companyId
    `);
  if (!employee.recordset[0]) {
    return { error: "Employee not found." };
  }
  if (roundDays(parsed.entitled) === leaveType.days_per_year) {
    await pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
      .input("year", sql.Int, parsed.year)
      .query(`
        DELETE FROM dbo.leave_balances
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND leave_type_id = @leaveTypeId
          AND year = @year
      `);
    return { id: 0 };
  }
  try {
    const existing = await pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
      .input("year", sql.Int, parsed.year)
      .query<{ id: number }>(`
        SELECT id
        FROM dbo.leave_balances
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND leave_type_id = @leaveTypeId
          AND year = @year
      `);
    if (existing.recordset[0]) {
      await pool
        .request()
        .input("id", sql.Int, existing.recordset[0].id)
        .input("companyId", sql.Int, session.company.id)
        .input("entitled", sql.Decimal(6, 2), parsed.entitled)
        .input("actorId", sql.Int, session.user.id)
        .query(`
          UPDATE dbo.leave_balances
          SET entitled = @entitled, updated_at = SYSUTCDATETIME(), updated_by = @actorId
          WHERE id = @id AND company_id = @companyId
        `);
      return { id: existing.recordset[0].id };
    }
    const inserted = await pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
      .input("year", sql.Int, parsed.year)
      .input("entitled", sql.Decimal(6, 2), parsed.entitled)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.leave_balances (
          company_id, employee_id, leave_type_id, year, entitled, created_by, updated_by
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @employeeId, @leaveTypeId, @year, @entitled, @actorId, @actorId)
      `);
    return { id: inserted.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: duplicateBalanceMessage(parsed.year) };
    }
    throw error;
  }
}

export async function deleteLeaveBalance(employeeId: number, leaveTypeId: number, year: number) {
  const session = await requireCompany("leaveBalances", "delete");
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("employeeId", sql.Int, employeeId)
    .input("leaveTypeId", sql.Int, leaveTypeId)
    .input("year", sql.Int, year)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.leave_balances
      WHERE company_id = @companyId
        AND employee_id = @employeeId
        AND leave_type_id = @leaveTypeId
        AND year = @year
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Leave balance not found." };
  }
  return { id: employeeId };
}

const REQUEST_WHERE = `
  WHERE r.company_id = @companyId
    AND (@status = N'' OR r.status = @status)
    ${REQUEST_SEARCH}
`;

export async function listLeaveRequests(query: ListQuery & { status: string }) {
  const session = await requireCompany("leaveRequests", "view");
  if ("error" in session) {
    return { rows: [] as LeaveRequestListRow[], totalCount: 0 };
  }
  const sortColumn = REQUEST_SORT[query.sortKey] ?? REQUEST_SORT.startDate;
  const direction = query.sortKey && REQUEST_SORT[query.sortKey] ? directionOf(query.sortDirection) : "DESC";
  const search = `%${query.search.trim()}%`;
  const status = isStatus(query.status) ? query.status : "";
  const offset = (query.page - 1) * query.pageSize;
  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .input("status", sql.NVarChar(20), status)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
    `);
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .input("status", sql.NVarChar(20), status)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<RequestSqlRow>(`
      SELECT
        r.id,
        r.employee_id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.employee_code,
        r.leave_type_id,
        t.name AS leave_type_name,
        r.start_date,
        r.end_date,
        r.days,
        r.note,
        r.status,
        ISNULL(NULLIF(u.full_name, N''), u.username) AS decided_by_name,
        r.decided_on
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
      ORDER BY ${sortColumn} ${direction}, r.id ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);
  return {
    rows: listResult.recordset.map(mapRequest),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listLeaveRequestsForExport(
  query: Omit<ListQuery, "page" | "pageSize"> & { status: string },
) {
  const session = await requireCompany("leaveRequests", "view");
  if ("error" in session) {
    return [] as LeaveRequestListRow[];
  }
  const sortColumn = REQUEST_SORT[query.sortKey] ?? REQUEST_SORT.startDate;
  const direction = query.sortKey && REQUEST_SORT[query.sortKey] ? directionOf(query.sortDirection) : "DESC";
  const search = `%${query.search.trim()}%`;
  const status = isStatus(query.status) ? query.status : "";
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .input("status", sql.NVarChar(20), status)
    .query<RequestSqlRow>(`
      SELECT
        r.id,
        r.employee_id,
        e.first_name,
        e.middle_name,
        e.last_name,
        e.employee_code,
        r.leave_type_id,
        t.name AS leave_type_name,
        r.start_date,
        r.end_date,
        r.days,
        r.note,
        r.status,
        ISNULL(NULLIF(u.full_name, N''), u.username) AS decided_by_name,
        r.decided_on
      ${REQUEST_FROM}
      ${REQUEST_WHERE}
      ORDER BY ${sortColumn} ${direction}, r.id ASC
    `);
  return result.recordset.map(mapRequest);
}

export async function createLeaveRequest(input: LeaveRequestInput) {
  const session = await requireCompany("leaveRequests", "create");
  if ("error" in session) {
    return session;
  }
  const parsed = validateRequestShape(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const problems = await requestProblems(transaction, session.company.id, parsed, null);
    if ("error" in problems) {
      await transaction.rollback();
      return problems;
    }
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
      .input("startDate", sql.Date, parsed.startDate)
      .input("endDate", sql.Date, parsed.endDate)
      .input("days", sql.Int, parsed.days)
      .input("note", sql.NVarChar(1000), parsed.note)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.leave_requests (
          company_id, employee_id, leave_type_id, start_date, end_date, days, note,
          status, created_by, updated_by
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @employeeId, @leaveTypeId, @startDate, @endDate, @days, @note,
          N'Pending', @actorId, @actorId
        )
      `);
    await transaction.commit();
    return { id: inserted.recordset[0].id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function updateLeaveRequest(id: number, input: LeaveRequestInput) {
  const session = await requireCompany("leaveRequests", "edit");
  if ("error" in session) {
    return session;
  }
  const parsed = validateRequestShape(input);
  if ("error" in parsed) {
    return parsed;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const current = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query<{ status: LeaveRequestStatus }>(`
        SELECT status
        FROM dbo.leave_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id AND company_id = @companyId
      `);
    const row = current.recordset[0];
    if (!row) {
      await transaction.rollback();
      return { error: "Leave request not found." };
    }
    if (row.status !== "Pending") {
      await transaction.rollback();
      return { error: "This request has already been decided." };
    }
    const problems = await requestProblems(transaction, session.company.id, parsed, id);
    if ("error" in problems) {
      await transaction.rollback();
      return problems;
    }
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("leaveTypeId", sql.Int, parsed.leaveTypeId)
      .input("startDate", sql.Date, parsed.startDate)
      .input("endDate", sql.Date, parsed.endDate)
      .input("days", sql.Int, parsed.days)
      .input("note", sql.NVarChar(1000), parsed.note)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.leave_requests
        SET
          employee_id = @employeeId,
          leave_type_id = @leaveTypeId,
          start_date = @startDate,
          end_date = @endDate,
          days = @days,
          note = @note,
          status = N'Pending',
          decided_by = NULL,
          decided_on = NULL,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id AND company_id = @companyId
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteLeaveRequest(id: number) {
  const session = await requireCompany("leaveRequests", "delete");
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const existing = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query<{ status: LeaveRequestStatus }>(`
      SELECT status FROM dbo.leave_requests WHERE id = @id AND company_id = @companyId
    `);
  const row = existing.recordset[0];
  if (!row) {
    return { error: "Leave request not found." };
  }
  if (row.status === "Approved") {
    return { error: "An approved leave request cannot be deleted." };
  }
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.leave_requests
      WHERE id = @id AND company_id = @companyId AND status <> N'Approved'
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Leave request not found." };
  }
  return { id };
}

export async function decideLeaveRequest(id: number, decision: "Approved" | "Rejected") {
  const session = await requireCompany("leaveRequests", "edit");
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
      .query<{
        status: LeaveRequestStatus;
        employee_id: number;
        leave_type_id: number;
        start_date: Date | string;
        end_date: Date | string;
      }>(`
        SELECT status, employee_id, leave_type_id, start_date, end_date
        FROM dbo.leave_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id AND company_id = @companyId
      `);
    const row = current.recordset[0];
    if (!row) {
      await transaction.rollback();
      return { error: "Leave request not found." };
    }
    if (row.status !== "Pending") {
      await transaction.rollback();
      return { error: "This request has already been decided." };
    }
    if (decision === "Approved") {
      const problems = await requestProblems(
        transaction,
        session.company.id,
        {
          employeeId: row.employee_id,
          leaveTypeId: row.leave_type_id,
          startDate: formatDate(row.start_date),
          endDate: formatDate(row.end_date),
        },
        id,
      );
      if ("error" in problems) {
        await transaction.rollback();
        return { error: `Cannot approve: ${problems.error}` };
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("status", sql.NVarChar(20), decision)
      .input("actorId", sql.Int, session.user.id)
      .input("decidedOn", sql.Date, today)
      .query(`
        UPDATE dbo.leave_requests
        SET
          status = @status,
          decided_by = @actorId,
          decided_on = @decidedOn,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id AND company_id = @companyId
      `);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
