import "server-only";
import {
  ATTENDANCE_STATUSES,
  type AttendanceEmployeeOption,
  type AttendanceInput,
  type AttendanceListRow,
  type AttendanceShiftOption,
  type AttendanceStatus,
  type MarkAttendanceRow,
  type MarkAttendanceSaveRow,
} from "@/components/attendance/attendance.types";
import { getPool, sql } from "./db";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

const ALL_DEPARTMENTS = "All departments";
const WEEKDAY_BY_INDEX = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const EMPLOYEE_NAME = `LTRIM(RTRIM(CONCAT(e.first_name, N' ', CASE WHEN e.middle_name IS NULL OR e.middle_name = N'' THEN N'' ELSE e.middle_name + N' ' END, e.last_name)))`;

const SCHEDULED_FROM = `
  FROM dbo.timetable_entries AS t
  INNER JOIN dbo.timetable_employees AS te
    ON te.timetable_entry_id = t.id AND te.company_id = t.company_id
  INNER JOIN dbo.employees AS e
    ON e.id = te.employee_id AND e.company_id = te.company_id
  LEFT JOIN dbo.attendance AS a
    ON a.company_id = t.company_id
   AND a.work_date = @workDate
   AND a.shift_id = t.shift_id
   AND a.employee_id = e.id
`;

const SCHEDULED_WHERE = `
  WHERE t.company_id = @companyId
    AND t.shift_id = @shiftId
    AND (
      (
        t.pattern = N'weekly'
        AND EXISTS (
          SELECT 1
          FROM dbo.timetable_weekdays AS w
          WHERE w.timetable_entry_id = t.id
            AND w.weekday = @weekday
        )
      )
      OR (t.pattern = N'date' AND t.work_date = @workDate)
    )
`;

const SCHEDULED_SEARCH = `
    AND (
      @search = N'%%'
      OR e.first_name LIKE @search
      OR ISNULL(e.middle_name, N'') LIKE @search
      OR e.last_name LIKE @search
      OR e.employee_code LIKE @search
      OR ${EMPLOYEE_NAME} LIKE @search
    )
`;

const VIEW_FROM = `
  FROM dbo.attendance AS a
  INNER JOIN dbo.employees AS e
    ON e.id = a.employee_id AND e.company_id = a.company_id
  INNER JOIN dbo.shifts AS s
    ON s.id = a.shift_id AND s.company_id = a.company_id
  INNER JOIN dbo.branches AS b
    ON b.id = s.branch_id AND b.company_id = s.company_id
  LEFT JOIN dbo.departments AS d
    ON d.id = s.department_id AND d.company_id = s.company_id
`;

const VIEW_SORT: Record<string, string> = {
  date: "a.work_date",
  employee: EMPLOYEE_NAME,
  shift: "s.name",
  branch: "b.name",
  department: `ISNULL(d.name, N'${ALL_DEPARTMENTS}')`,
  status: "a.status",
};

const VIEW_SEARCH = `
    AND (
      @search = N'%%'
      OR CONVERT(char(10), a.work_date, 23) LIKE @search
      OR e.first_name LIKE @search
      OR ISNULL(e.middle_name, N'') LIKE @search
      OR e.last_name LIKE @search
      OR e.employee_code LIKE @search
      OR ${EMPLOYEE_NAME} LIKE @search
      OR s.name LIKE @search
      OR b.name LIKE @search
      OR ISNULL(d.name, N'${ALL_DEPARTMENTS}') LIKE @search
      OR a.status LIKE @search
    )
    AND (@month = N'' OR CONVERT(char(7), a.work_date, 23) = @month)
    AND (@status = N'' OR a.status = @status)
`;

type ScheduledSqlRow = {
  id: number;
  employee_name: string;
  employee_code: string;
  status: string;
};

type ViewSqlRow = {
  id: number;
  work_date: Date | string;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  shift_id: number;
  shift_name: string;
  branch_name: string;
  department_name: string;
  status: string;
};

type ShiftOptionSqlRow = {
  id: number;
  name: string;
  start_time: Date | string;
  end_time: Date | string;
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

function weekdayOf(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return trimmed;
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

function formatTime(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 5);
  }
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function employeeName(row: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}) {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function isStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
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

function bindScheduled(
  request: sql.Request,
  companyId: number,
  shiftId: number,
  workDate: string,
  weekday: string,
  search = "",
) {
  return request
    .input("companyId", sql.Int, companyId)
    .input("shiftId", sql.Int, shiftId)
    .input("workDate", sql.Date, workDate)
    .input("weekday", sql.NVarChar(9), weekday)
    .input("search", sql.NVarChar(400), `%${search.trim()}%`);
}

async function listScheduled(
  companyId: number,
  shiftId: number,
  workDate: string,
  options: { search: string; sortDirection: "asc" | "desc"; offset?: number; pageSize?: number },
) {
  const weekday = weekdayOf(workDate);
  const direction = options.sortDirection === "desc" ? "DESC" : "ASC";
  const paged = options.offset !== undefined && options.pageSize !== undefined;
  const pool = await getPool();
  const request = bindScheduled(pool.request(), companyId, shiftId, workDate, weekday, options.search);
  if (paged) {
    request.input("offset", sql.Int, options.offset ?? 0);
    request.input("pageSize", sql.Int, options.pageSize ?? 0);
  }
  const listed = await request.query<ScheduledSqlRow>(`
      SELECT DISTINCT
        e.id,
        ${EMPLOYEE_NAME} AS employee_name,
        e.employee_code,
        ISNULL(a.status, N'') AS status
      ${SCHEDULED_FROM}
      ${SCHEDULED_WHERE}
      ${SCHEDULED_SEARCH}
      ORDER BY employee_name ${direction}, e.id ASC
      ${paged ? "OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY" : ""}
    `);
  return listed.recordset.map(mapScheduled);
}

function mapScheduled(row: ScheduledSqlRow): MarkAttendanceRow {
  return {
    employeeId: row.id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    status: isStatus(row.status) ? row.status : "",
  };
}

async function countScheduled(
  companyId: number,
  shiftId: number,
  workDate: string,
  search: string,
) {
  const pool = await getPool();
  const result = await bindScheduled(
    pool.request(),
    companyId,
    shiftId,
    workDate,
    weekdayOf(workDate),
    search,
  ).query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT DISTINCT e.id
        ${SCHEDULED_FROM}
        ${SCHEDULED_WHERE}
        ${search ? SCHEDULED_SEARCH : ""}
      ) AS scheduled
    `);
  return result.recordset[0]?.total ?? 0;
}

export async function listAttendanceOptions() {
  const empty = {
    shifts: [] as AttendanceShiftOption[],
    employees: [] as AttendanceEmployeeOption[],
  };
  const session = await requireCompany();
  if ("error" in session) {
    return empty;
  }

  const pool = await getPool();
  const companyId = session.company.id;
  const [shifts, employees] = await Promise.all([
    pool.request().input("companyId", sql.Int, companyId).query<ShiftOptionSqlRow>(`
      SELECT s.id, s.name, s.start_time, s.end_time
      FROM dbo.shifts AS s
      WHERE s.company_id = @companyId
      ORDER BY s.name, s.id
    `),
    pool.request().input("companyId", sql.Int, companyId).query<{
      id: number;
      first_name: string;
      middle_name: string | null;
      last_name: string;
      employee_code: string;
    }>(`
      SELECT e.id, e.first_name, e.middle_name, e.last_name, e.employee_code
      FROM dbo.employees AS e
      WHERE e.company_id = @companyId
        AND e.status = N'Active'
      ORDER BY e.last_name, e.first_name, e.id
    `),
  ]);

  return {
    shifts: shifts.recordset.map((shift) => {
      const start = formatTime(shift.start_time);
      const end = formatTime(shift.end_time);
      return {
        id: shift.id,
        name: shift.name,
        markLabel: `${shift.name} (${start}–${end})`,
      };
    }),
    employees: employees.recordset.map((employee) => ({
      id: employee.id,
      name: employeeName(employee),
      employeeCode: employee.employee_code,
    })),
  };
}

export async function listMarkAttendance(query: {
  workDate: string;
  shiftId: number;
  search: string;
  page: number;
  pageSize: number;
  sortDirection: "asc" | "desc";
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as MarkAttendanceRow[], totalCount: 0, scheduledCount: 0 };
  }
  const workDate = parseDate(query.workDate);
  if (!workDate || !query.shiftId) {
    return { rows: [] as MarkAttendanceRow[], totalCount: 0, scheduledCount: 0 };
  }

  const companyId = session.company.id;
  const [scheduledCount, totalCount, rows] = await Promise.all([
    countScheduled(companyId, query.shiftId, workDate, ""),
    countScheduled(companyId, query.shiftId, workDate, query.search),
    listScheduled(companyId, query.shiftId, workDate, {
      search: query.search,
      sortDirection: query.sortDirection,
      offset: (query.page - 1) * query.pageSize,
      pageSize: query.pageSize,
    }),
  ]);

  return { rows, totalCount, scheduledCount };
}

export async function listMarkRoster(query: { workDate: string; shiftId: number }) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const workDate = parseDate(query.workDate);
  if (!workDate || !query.shiftId) {
    return { error: "Choose a date and shift." };
  }
  const rows = await listScheduled(session.company.id, query.shiftId, workDate, {
    search: "",
    sortDirection: "asc",
  });
  return { rows };
}

export async function listMarkAttendanceForExport(query: {
  workDate: string;
  shiftId: number;
  search: string;
  sortDirection: "asc" | "desc";
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return [] as MarkAttendanceRow[];
  }
  const workDate = parseDate(query.workDate);
  if (!workDate || !query.shiftId) {
    return [] as MarkAttendanceRow[];
  }
  return listScheduled(session.company.id, query.shiftId, workDate, {
    search: query.search,
    sortDirection: query.sortDirection,
  });
}

export async function saveMarkAttendance(input: {
  workDate: string;
  shiftId: number;
  rows: MarkAttendanceSaveRow[];
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const workDate = parseDate(input.workDate);
  if (!workDate || !input.shiftId) {
    return { error: "Choose a date and shift." };
  }

  const rows = Array.isArray(input.rows) ? input.rows : [];
  for (const row of rows) {
    if (row.status && !isStatus(row.status)) {
      return { error: "Choose a valid status." };
    }
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const shift = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("shiftId", sql.Int, input.shiftId)
      .query<{ ok: number }>(`
        SELECT 1 AS ok
        FROM dbo.shifts
        WHERE id = @shiftId
          AND company_id = @companyId
      `);
    if (!shift.recordset[0]) {
      await transaction.rollback();
      return { error: "Shift not found." };
    }

    const scheduled = await bindScheduled(
      new sql.Request(transaction),
      session.company.id,
      input.shiftId,
      workDate,
      weekdayOf(workDate),
    ).query<{ id: number }>(`
        SELECT DISTINCT e.id
        ${SCHEDULED_FROM}
        ${SCHEDULED_WHERE}
      `);
    const scheduledIds = scheduled.recordset.map((row) => row.id).sort((a, b) => a - b);
    const incomingIds = rows.map((row) => row.employeeId).sort((a, b) => a - b);
    const sameRoster =
      scheduledIds.length === incomingIds.length &&
      scheduledIds.every((id, index) => id === incomingIds[index]);
    if (!sameRoster || new Set(rows.map((row) => row.employeeId)).size !== rows.length) {
      await transaction.rollback();
      return { error: "The scheduled employees changed. Reload and try again." };
    }

    for (const row of rows) {
      const request = new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("workDate", sql.Date, workDate)
        .input("shiftId", sql.Int, input.shiftId)
        .input("employeeId", sql.Int, row.employeeId)
        .input("actorId", sql.Int, session.user.id);
      if (!row.status) {
        await request.query(`
          DELETE FROM dbo.attendance
          WHERE company_id = @companyId
            AND work_date = @workDate
            AND shift_id = @shiftId
            AND employee_id = @employeeId
        `);
        continue;
      }
      const updated = await request.input("status", sql.NVarChar(20), row.status).query(`
        UPDATE dbo.attendance
        SET
          status = @status,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE company_id = @companyId
          AND work_date = @workDate
          AND shift_id = @shiftId
          AND employee_id = @employeeId
      `);
      if (!updated.rowsAffected[0]) {
        await new sql.Request(transaction)
          .input("companyId", sql.Int, session.company.id)
          .input("workDate", sql.Date, workDate)
          .input("shiftId", sql.Int, input.shiftId)
          .input("employeeId", sql.Int, row.employeeId)
          .input("status", sql.NVarChar(20), row.status)
          .input("actorId", sql.Int, session.user.id)
          .query(`
            INSERT INTO dbo.attendance (
              company_id, work_date, shift_id, employee_id, status, created_by, updated_by
            )
            VALUES (
              @companyId, @workDate, @shiftId, @employeeId, @status, @actorId, @actorId
            )
          `);
      }
    }

    await transaction.commit();
    return { saved: rows.filter((row) => row.status).length };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function mapView(row: ViewSqlRow): AttendanceListRow {
  return {
    id: row.id,
    workDate: formatDate(row.work_date),
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    shiftId: row.shift_id,
    shiftName: row.shift_name,
    branchName: row.branch_name,
    departmentName: row.department_name,
    status: isStatus(row.status) ? row.status : "Present",
  };
}

function viewOrder(sortKey: string, sortDirection: "asc" | "desc") {
  const column = VIEW_SORT[sortKey] ?? VIEW_SORT.date;
  const direction = sortDirection === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${column} ${direction}, ${EMPLOYEE_NAME} ASC, a.id ASC`;
}

async function queryView(
  companyId: number,
  query: {
    month: string;
    status: string;
    search: string;
    sortKey: string;
    sortDirection: "asc" | "desc";
    offset?: number;
    pageSize?: number;
  },
) {
  const paged = query.offset !== undefined && query.pageSize !== undefined;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("month", sql.NVarChar(7), query.month)
    .input("status", sql.NVarChar(20), query.status)
    .input("search", sql.NVarChar(400), `%${query.search.trim()}%`)
    .input("offset", sql.Int, query.offset ?? 0)
    .input("pageSize", sql.Int, query.pageSize ?? 0)
    .query<ViewSqlRow>(`
      SELECT
        a.id,
        a.work_date,
        a.employee_id,
        ${EMPLOYEE_NAME} AS employee_name,
        e.employee_code,
        a.shift_id,
        s.name AS shift_name,
        b.name AS branch_name,
        ISNULL(d.name, N'${ALL_DEPARTMENTS}') AS department_name,
        a.status
      ${VIEW_FROM}
      WHERE a.company_id = @companyId
      ${VIEW_SEARCH}
      ${viewOrder(query.sortKey, query.sortDirection)}
      ${paged ? "OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY" : ""}
    `);
  return result.recordset.map(mapView);
}

export async function listAttendance(query: {
  month: string;
  status: string;
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [] as AttendanceListRow[], totalCount: 0 };
  }
  const month = /^\d{4}-\d{2}$/.test(query.month) ? query.month : "";
  const status = isStatus(query.status) ? query.status : "";
  const pool = await getPool();
  const count = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("month", sql.NVarChar(7), month)
    .input("status", sql.NVarChar(20), status)
    .input("search", sql.NVarChar(400), `%${query.search.trim()}%`)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${VIEW_FROM}
      WHERE a.company_id = @companyId
      ${VIEW_SEARCH}
    `);
  const rows = await queryView(session.company.id, {
    month,
    status,
    search: query.search,
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
    offset: (query.page - 1) * query.pageSize,
    pageSize: query.pageSize,
  });
  return { rows, totalCount: count.recordset[0]?.total ?? 0 };
}

export async function listAttendanceForExport(query: {
  month: string;
  status: string;
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  const session = await requireCompany();
  if ("error" in session) {
    return [] as AttendanceListRow[];
  }
  return queryView(session.company.id, {
    month: /^\d{4}-\d{2}$/.test(query.month) ? query.month : "",
    status: isStatus(query.status) ? query.status : "",
    search: query.search,
    sortKey: query.sortKey,
    sortDirection: query.sortDirection,
  });
}

function validateAttendance(input: AttendanceInput) {
  const workDate = parseDate(input.workDate);
  if (!workDate || !input.employeeId || !input.shiftId || !isStatus(input.status)) {
    return { error: "All fields are required." };
  }
  return {
    workDate,
    employeeId: input.employeeId,
    shiftId: input.shiftId,
    status: input.status,
  };
}

async function attendanceTaken(
  transaction: sql.Transaction,
  companyId: number,
  workDate: string,
  shiftId: number,
  employeeId: number,
  excludeId: number,
) {
  const existing = await new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .input("workDate", sql.Date, workDate)
    .input("shiftId", sql.Int, shiftId)
    .input("employeeId", sql.Int, employeeId)
    .input("excludeId", sql.Int, excludeId)
    .query<{ id: number }>(`
      SELECT a.id
      FROM dbo.attendance AS a
      WHERE a.company_id = @companyId
        AND a.work_date = @workDate
        AND a.shift_id = @shiftId
        AND a.employee_id = @employeeId
        AND a.id <> @excludeId
    `);
  return Boolean(existing.recordset[0]);
}

const DUPLICATE_MESSAGE = "Attendance is already recorded for this employee, shift and date.";

async function referencesBelong(
  transaction: sql.Transaction,
  companyId: number,
  shiftId: number,
  employeeId: number,
) {
  const found = await new sql.Request(transaction)
    .input("companyId", sql.Int, companyId)
    .input("shiftId", sql.Int, shiftId)
    .input("employeeId", sql.Int, employeeId)
    .query<{ shift_ok: number; employee_ok: number }>(`
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.shifts WHERE id = @shiftId AND company_id = @companyId
        ) THEN 1 ELSE 0 END AS shift_ok,
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.employees WHERE id = @employeeId AND company_id = @companyId
        ) THEN 1 ELSE 0 END AS employee_ok
    `);
  const row = found.recordset[0];
  if (!row?.shift_ok) {
    return { error: "Shift not found." };
  }
  if (!row.employee_ok) {
    return { error: "Employee not found." };
  }
  return {};
}

export async function createAttendance(input: AttendanceInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateAttendance(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await referencesBelong(
      transaction,
      session.company.id,
      parsed.shiftId,
      parsed.employeeId,
    );
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    if (
      await attendanceTaken(
        transaction,
        session.company.id,
        parsed.workDate,
        parsed.shiftId,
        parsed.employeeId,
        0,
      )
    ) {
      await transaction.rollback();
      return { error: DUPLICATE_MESSAGE };
    }
    const inserted = await new sql.Request(transaction)
      .input("companyId", sql.Int, session.company.id)
      .input("workDate", sql.Date, parsed.workDate)
      .input("shiftId", sql.Int, parsed.shiftId)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("status", sql.NVarChar(20), parsed.status)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.attendance (
          company_id, work_date, shift_id, employee_id, status, created_by, updated_by
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @workDate, @shiftId, @employeeId, @status, @actorId, @actorId)
      `);
    await transaction.commit();
    return { id: inserted.recordset[0].id };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: DUPLICATE_MESSAGE };
    }
    throw error;
  }
}

export async function updateAttendance(id: number, input: AttendanceInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const parsed = validateAttendance(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const lookup = await referencesBelong(
      transaction,
      session.company.id,
      parsed.shiftId,
      parsed.employeeId,
    );
    if ("error" in lookup) {
      await transaction.rollback();
      return lookup;
    }
    if (
      await attendanceTaken(
        transaction,
        session.company.id,
        parsed.workDate,
        parsed.shiftId,
        parsed.employeeId,
        id,
      )
    ) {
      await transaction.rollback();
      return { error: DUPLICATE_MESSAGE };
    }
    const updated = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("workDate", sql.Date, parsed.workDate)
      .input("shiftId", sql.Int, parsed.shiftId)
      .input("employeeId", sql.Int, parsed.employeeId)
      .input("status", sql.NVarChar(20), parsed.status)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.attendance
        SET
          work_date = @workDate,
          shift_id = @shiftId,
          employee_id = @employeeId,
          status = @status,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);
    if (!updated.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Attendance not found." };
    }
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: DUPLICATE_MESSAGE };
    }
    throw error;
  }
}

export async function deleteAttendance(id: number) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.attendance
      WHERE id = @id
        AND company_id = @companyId
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Attendance not found." };
  }
  return { id };
}
