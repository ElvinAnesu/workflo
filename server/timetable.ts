import "server-only";
import type { AccessAction } from "@/lib/access";
import { requireFeature } from "./access";
import {
  WEEKDAYS,
  type TimetableDepartmentOption,
  type TimetableEmployeeChoice,
  type TimetableEmployeeFilter,
  type TimetableEmployeeOption,
  type TimetableInput,
  type TimetableListRow,
  type TimetablePattern,
  type TimetableShiftOption,
} from "@/components/timetable/timetable.types";
import { getPool, sql } from "./db";
import type { SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type TimetableListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const ALL_DEPARTMENTS = "All departments";

const PATTERN_LABEL = `CASE t.pattern WHEN N'weekly' THEN N'Weekly' ELSE N'Date override' END`;
const DAY_OR_DATE = `CASE WHEN t.pattern = N'date' THEN CONVERT(char(10), t.work_date, 23) ELSE ISNULL(wd.weekdays_label, N'') END`;

const SORT_COLUMNS: Record<string, string> = {
  name: "t.name",
  pattern: PATTERN_LABEL,
  dayOrDate: DAY_OR_DATE,
  shift: "s.name",
  branch: "b.name",
  department: `ISNULL(d.name, N'${ALL_DEPARTMENTS}')`,
  employeeCount: "ec.employee_count",
};

const TIMETABLE_FROM = `
  FROM dbo.timetable_entries AS t
  INNER JOIN dbo.shifts AS s
    ON s.id = t.shift_id AND s.company_id = t.company_id
  INNER JOIN dbo.branches AS b
    ON b.id = s.branch_id AND b.company_id = s.company_id
  LEFT JOIN dbo.departments AS d
    ON d.id = s.department_id AND d.company_id = s.company_id
  OUTER APPLY (
    SELECT STRING_AGG(w.weekday, N', ') WITHIN GROUP (
      ORDER BY CASE w.weekday
        WHEN N'Monday' THEN 1
        WHEN N'Tuesday' THEN 2
        WHEN N'Wednesday' THEN 3
        WHEN N'Thursday' THEN 4
        WHEN N'Friday' THEN 5
        WHEN N'Saturday' THEN 6
        WHEN N'Sunday' THEN 7
        ELSE 8
      END
    ) AS weekdays_label
    FROM dbo.timetable_weekdays AS w
    WHERE w.timetable_entry_id = t.id
  ) AS wd
  OUTER APPLY (
    SELECT COUNT(*) AS employee_count
    FROM dbo.timetable_employees AS te_count
    WHERE te_count.timetable_entry_id = t.id
  ) AS ec
`;

const TIMETABLE_SEARCH = `
        AND (
          @search = N'%%'
          OR t.name LIKE @search
          OR ${PATTERN_LABEL} LIKE @search
          OR ${DAY_OR_DATE} LIKE @search
          OR s.name LIKE @search
          OR b.name LIKE @search
          OR ISNULL(d.name, N'${ALL_DEPARTMENTS}') LIKE @search
          OR EXISTS (
            SELECT 1
            FROM dbo.timetable_employees AS te
            INNER JOIN dbo.employees AS emp
              ON emp.id = te.employee_id AND emp.company_id = te.company_id
            WHERE te.timetable_entry_id = t.id
              AND (
                emp.first_name LIKE @search
                OR ISNULL(emp.middle_name, N'') LIKE @search
                OR emp.last_name LIKE @search
                OR emp.employee_code LIKE @search
                OR CONCAT(
                  emp.first_name,
                  N' ',
                  CASE
                    WHEN emp.middle_name IS NULL OR emp.middle_name = N'' THEN N''
                    ELSE emp.middle_name + N' '
                  END,
                  emp.last_name
                ) LIKE @search
              )
          )
        )
`;

type TimetableSqlRow = {
  id: number;
  name: string;
  shift_id: number;
  shift_name: string;
  branch_name: string;
  department_name: string;
  pattern: string;
  work_date: Date | string | null;
};

type WeekdaySqlRow = {
  timetable_entry_id: number;
  weekday: string;
};

type EmployeeSqlRow = {
  timetable_entry_id: number;
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employee_code: string;
};

type ShiftOptionSqlRow = {
  id: number;
  name: string;
  branch_name: string;
  start_time: Date | string;
  end_time: Date | string;
};

type EmployeeOptionSqlRow = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  employee_code: string;
  department_id: number | null;
  department_name: string | null;
};

type ParsedTimetable = {
  name: string;
  shiftId: number;
  pattern: TimetablePattern;
  weekdays: string[];
  workDate: string | null;
  employeeIds: number[];
};

const WEEKDAY_ORDER = new Map<string, number>(WEEKDAYS.map((day, index) => [day, index]));

function requireCompany(action: AccessAction) {
  return requireFeature("timetable", action);
}

function formatTime(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 5);
  }
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function employeeName(row: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}) {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function parseWorkDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function validateInput(input: TimetableInput): { error: string } | ParsedTimetable {
  const name = input.name.trim();
  if (!name) {
    return { error: "Name is required." };
  }
  if (name.length > 200) {
    return { error: "Name must be 200 characters or fewer." };
  }
  const pattern = input.pattern;
  const shiftId = input.shiftId;
  if (!shiftId || (pattern !== "weekly" && pattern !== "date")) {
    return { error: "Choose a shift and a pattern." };
  }

  const requestedDays = Array.isArray(input.weekdays) ? input.weekdays : [];
  const weekdays = WEEKDAYS.filter((day) => requestedDays.includes(day));
  if (pattern === "weekly" && weekdays.length === 0) {
    return { error: "Choose at least one day of the week." };
  }

  const workDate = parseWorkDate(input.workDate.trim());
  if (pattern === "date" && !workDate) {
    return { error: "Choose a date." };
  }

  const requestedIds = Array.isArray(input.employeeIds) ? input.employeeIds : [];
  const employeeIds = requestedIds.filter((id) => Number.isInteger(id) && id > 0);
  if (employeeIds.length === 0) {
    return { error: "Add at least one employee." };
  }
  if (new Set(employeeIds).size !== employeeIds.length) {
    return { error: "The same employee is listed more than once." };
  }

  return {
    name,
    shiftId,
    pattern,
    weekdays: pattern === "weekly" ? [...weekdays] : [],
    workDate: pattern === "date" ? workDate : null,
    employeeIds,
  };
}

async function loadChildren(companyId: number, ids: number[]) {
  const weekdays = new Map<number, string[]>();
  const employees = new Map<number, TimetableEmployeeOption[]>();
  if (ids.length === 0) {
    return { weekdays, employees };
  }

  const pool = await getPool();
  const request = () =>
    pool
      .request()
      .input("companyId", sql.Int, companyId)
      .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids));

  const weekdayResult = await request().query<WeekdaySqlRow>(`
    SELECT w.timetable_entry_id, w.weekday
    FROM dbo.timetable_weekdays AS w
    INNER JOIN dbo.timetable_entries AS t
      ON t.id = w.timetable_entry_id
    WHERE t.company_id = @companyId
      AND t.id IN (SELECT CAST(ids.[value] AS int) FROM OPENJSON(@ids) AS ids)
  `);
  const employeeResult = await request().query<EmployeeSqlRow>(`
    SELECT
      te.timetable_entry_id,
      emp.id,
      emp.first_name,
      emp.middle_name,
      emp.last_name,
      emp.employee_code
    FROM dbo.timetable_employees AS te
    INNER JOIN dbo.timetable_entries AS t
      ON t.id = te.timetable_entry_id AND t.company_id = te.company_id
    INNER JOIN dbo.employees AS emp
      ON emp.id = te.employee_id AND emp.company_id = te.company_id
    WHERE t.company_id = @companyId
      AND t.id IN (SELECT CAST(ids.[value] AS int) FROM OPENJSON(@ids) AS ids)
    ORDER BY emp.last_name, emp.first_name, emp.id
  `);

  for (const row of weekdayResult.recordset) {
    const days = weekdays.get(row.timetable_entry_id) ?? [];
    days.push(row.weekday);
    weekdays.set(row.timetable_entry_id, days);
  }
  for (const [entryId, days] of weekdays) {
    days.sort((left, right) => (WEEKDAY_ORDER.get(left) ?? 0) - (WEEKDAY_ORDER.get(right) ?? 0));
    weekdays.set(entryId, days);
  }
  for (const row of employeeResult.recordset) {
    const assigned = employees.get(row.timetable_entry_id) ?? [];
    assigned.push({
      id: row.id,
      name: employeeName(row),
      employeeCode: row.employee_code,
    });
    employees.set(row.timetable_entry_id, assigned);
  }
  return { weekdays, employees };
}

function mapEntry(
  row: TimetableSqlRow,
  weekdays: Map<number, string[]>,
  employees: Map<number, TimetableEmployeeOption[]>,
): TimetableListRow {
  const pattern: TimetablePattern = row.pattern === "date" ? "date" : "weekly";
  return {
    id: row.id,
    name: row.name,
    shiftId: row.shift_id,
    shiftName: row.shift_name,
    branchName: row.branch_name,
    departmentName: row.department_name,
    pattern,
    weekdays: pattern === "weekly" ? (weekdays.get(row.id) ?? []) : [],
    workDate: pattern === "date" ? formatDate(row.work_date) : "",
    employees: employees.get(row.id) ?? [],
  };
}

async function queryEntries(
  companyId: number,
  query: Omit<TimetableListQuery, "page" | "pageSize"> & { offset?: number; pageSize?: number },
) {
  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.pattern;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const paged = query.offset !== undefined && query.pageSize !== undefined;
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("search", sql.NVarChar(400), search)
    .input("offset", sql.Int, query.offset ?? 0)
    .input("pageSize", sql.Int, query.pageSize ?? 0)
    .query<TimetableSqlRow>(`
      SELECT
        t.id,
        t.name,
        t.shift_id,
        s.name AS shift_name,
        b.name AS branch_name,
        ISNULL(d.name, N'${ALL_DEPARTMENTS}') AS department_name,
        t.pattern,
        t.work_date
      ${TIMETABLE_FROM}
      WHERE t.company_id = @companyId
      ${TIMETABLE_SEARCH}
      ORDER BY ${sortColumn} ${direction}, t.id ASC
      ${paged ? "OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY" : ""}
    `);
  const children = await loadChildren(
    companyId,
    listResult.recordset.map((row) => row.id),
  );
  return listResult.recordset.map((row) => mapEntry(row, children.weekdays, children.employees));
}

export async function listTimetableFormOptions() {
  const empty = {
    shifts: [] as TimetableShiftOption[],
    departments: [] as TimetableDepartmentOption[],
  };
  const session = await requireCompany("view");
  if ("error" in session) {
    return empty;
  }

  const pool = await getPool();
  const companyId = session.company.id;
  const [shifts, departments] = await Promise.all([
    pool.request().input("companyId", sql.Int, companyId).query<ShiftOptionSqlRow>(`
      SELECT s.id, s.name, b.name AS branch_name, s.start_time, s.end_time
      FROM dbo.shifts AS s
      INNER JOIN dbo.branches AS b
        ON b.id = s.branch_id AND b.company_id = s.company_id
      WHERE s.company_id = @companyId
      ORDER BY s.name, s.id
    `),
    pool.request().input("companyId", sql.Int, companyId).query<TimetableDepartmentOption>(`
      SELECT d.id, d.name
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId
        AND d.is_active = 1
      ORDER BY d.name
    `),
  ]);

  return {
    shifts: shifts.recordset.map((shift) => ({
      id: shift.id,
      label: `${shift.name} · ${shift.branch_name} (${formatTime(shift.start_time)}–${formatTime(shift.end_time)})`,
    })),
    departments: departments.recordset,
  };
}

const NO_DEPARTMENT = "No department";

export async function listTimetableEmployees(
  query: TimetableEmployeeFilter,
): Promise<TimetableEmployeeChoice[]> {
  const session = await requireCompany("view");
  if ("error" in session) {
    return [];
  }

  const includeIds = (Array.isArray(query.includeIds) ? query.includeIds : []).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  const filter =
    query.filter === "none" || query.filter === "department" ? query.filter : "all";
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
    .query<EmployeeOptionSqlRow>(`
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
              WHERE dept.id = @departmentId
                AND dept.company_id = @companyId
            )
          )
        )
        AND (
          @search = N'%%'
          OR e.first_name LIKE @search
          OR ISNULL(e.middle_name, N'') LIKE @search
          OR e.last_name LIKE @search
          OR e.employee_code LIKE @search
          OR LTRIM(RTRIM(CONCAT(
            e.first_name,
            N' ',
            CASE
              WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N''
              ELSE e.middle_name + N' '
            END,
            e.last_name
          ))) LIKE @search
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

export async function listTimetable(query: TimetableListQuery) {
  const session = await requireCompany("view");
  if ("error" in session) {
    return { rows: [], totalCount: 0 };
  }

  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(400), search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${TIMETABLE_FROM}
      WHERE t.company_id = @companyId
      ${TIMETABLE_SEARCH}
    `);
  const rows = await queryEntries(session.company.id, {
    search: query.search,
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
    offset: (query.page - 1) * query.pageSize,
    pageSize: query.pageSize,
  });

  return {
    rows,
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listTimetableForExport(
  query: Omit<TimetableListQuery, "page" | "pageSize">,
) {
  const session = await requireCompany("view");
  if ("error" in session) {
    return [];
  }
  return queryEntries(session.company.id, query);
}

async function belongsToCompany(
  transaction: sql.Transaction,
  companyId: number,
  input: ParsedTimetable,
) {
  const shift = await new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .input("shiftId", sql.Int, input.shiftId)
    .query<{ ok: number }>(`
      SELECT 1 AS ok
      FROM dbo.shifts
      WHERE id = @shiftId
        AND company_id = @companyId
    `);
  if (!shift.recordset[0]) {
    return { error: "Shift not found." };
  }

  const employees = await new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(input.employeeIds))
    .query<{ id: number }>(`
      SELECT emp.id
      FROM OPENJSON(@ids) AS ids
      INNER JOIN dbo.employees AS emp
        ON emp.id = CAST(ids.[value] AS int)
       AND emp.company_id = @companyId
    `);
  if (employees.recordset.length !== input.employeeIds.length) {
    return { error: "Employee not found." };
  }
  return {};
}

async function insertChildren(
  transaction: sql.Transaction,
  companyId: number,
  entryId: number,
  input: ParsedTimetable,
) {
  for (const weekday of input.weekdays) {
    await new sql.Request(transaction)
      .input("entryId", sql.Int, entryId)
      .input("weekday", sql.NVarChar(9), weekday)
      .query(`
        INSERT INTO dbo.timetable_weekdays (timetable_entry_id, weekday)
        VALUES (@entryId, @weekday)
      `);
  }
  for (const employeeId of input.employeeIds) {
    await new sql.Request(transaction)
      .input("entryId", sql.Int, entryId)
      .input("companyId", sql.Int, companyId)
      .input("employeeId", sql.Int, employeeId)
      .query(`
        INSERT INTO dbo.timetable_employees (timetable_entry_id, company_id, employee_id)
        VALUES (@entryId, @companyId, @employeeId)
      `);
  }
}

async function saveTimetable(
  companyId: number,
  actorId: number,
  input: ParsedTimetable,
  id: number | null,
) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await belongsToCompany(transaction, companyId, input);
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }

    if (id === null) {
      const inserted = await new sql.Request(transaction)
        .input("companyId", sql.Int, companyId)
        .input("name", sql.NVarChar(200), input.name)
        .input("shiftId", sql.Int, input.shiftId)
        .input("pattern", sql.NVarChar(20), input.pattern)
        .input("workDate", sql.Date, input.workDate)
        .input("actorId", sql.Int, actorId)
        .query<{ id: number }>(`
          INSERT INTO dbo.timetable_entries (
            company_id, name, shift_id, pattern, work_date, created_by, updated_by
          )
          OUTPUT INSERTED.id
          VALUES (@companyId, @name, @shiftId, @pattern, @workDate, @actorId, @actorId)
        `);
      const entryId = inserted.recordset[0].id;
      await insertChildren(transaction, companyId, entryId, input);
      await transaction.commit();
      return { id: entryId };
    }

    const updated = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, companyId)
      .input("name", sql.NVarChar(200), input.name)
      .input("shiftId", sql.Int, input.shiftId)
      .input("pattern", sql.NVarChar(20), input.pattern)
      .input("workDate", sql.Date, input.workDate)
      .input("actorId", sql.Int, actorId)
      .query(`
        UPDATE dbo.timetable_entries
        SET
          name = @name,
          shift_id = @shiftId,
          pattern = @pattern,
          work_date = @workDate,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);
    if (!updated.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Timetable entry not found." };
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`DELETE FROM dbo.timetable_weekdays WHERE timetable_entry_id = @id`);
    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, companyId)
      .query(`
        DELETE FROM dbo.timetable_employees
        WHERE timetable_entry_id = @id
          AND company_id = @companyId
      `);
    await insertChildren(transaction, companyId, id, input);
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function createTimetable(input: TimetableInput) {
  const session = await requireCompany("create");
  if ("error" in session) {
    return session;
  }
  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }
  return saveTimetable(session.company.id, session.user.id, parsed, null);
}

export async function updateTimetable(id: number, input: TimetableInput) {
  const session = await requireCompany("edit");
  if ("error" in session) {
    return session;
  }
  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }
  return saveTimetable(session.company.id, session.user.id, parsed, id);
}

export async function deleteTimetable(id: number) {
  const session = await requireCompany("delete");
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .query(`
        DELETE FROM dbo.timetable_entries
        WHERE id = @id
          AND company_id = @companyId
      `);
    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Timetable entry not found." };
    }
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
