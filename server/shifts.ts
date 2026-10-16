import "server-only";
import type { AccessAction } from "@/lib/access";
import { requireFeature } from "./access";
import type {
  ShiftInput,
  ShiftListRow,
  ShiftLookupOption,
} from "@/components/shifts/shift.types";
import { getPool, sql } from "./db";
import type { SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type ShiftListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const ALL_DEPARTMENTS = "All departments";
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const SORT_COLUMNS: Record<string, string> = {
  shiftName: "s.name",
  branch: "b.name",
  department: `ISNULL(d.name, N'${ALL_DEPARTMENTS}')`,
  startTime: "s.start_time",
  endTime: "s.end_time",
};

const SHIFT_FROM = `
  FROM dbo.shifts AS s
  INNER JOIN dbo.branches AS b
    ON b.id = s.branch_id AND b.company_id = s.company_id
  LEFT JOIN dbo.departments AS d
    ON d.id = s.department_id AND d.company_id = s.company_id
`;

const SHIFT_SEARCH = `
        AND (
          @search = N'%%'
          OR s.name LIKE @search
          OR b.name LIKE @search
          OR ISNULL(d.name, N'${ALL_DEPARTMENTS}') LIKE @search
        )
`;

type ShiftSqlRow = {
  id: number;
  name: string;
  branch_id: number;
  branch_name: string;
  department_id: number | null;
  department_name: string;
  start_time: Date | string;
  end_time: Date | string;
};

function errorNumber(error: unknown) {
  return error && typeof error === "object" && "number" in error
    ? Number((error as { number: unknown }).number)
    : NaN;
}

function isUniqueError(error: unknown) {
  const number = errorNumber(error);
  return number === 2627 || number === 2601;
}

function requireCompany(action: AccessAction) {
  return requireFeature("shifts", action);
}

function formatTime(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 5);
  }
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function mapShift(row: ShiftSqlRow): ShiftListRow {
  return {
    id: row.id,
    shiftName: row.name,
    branchId: row.branch_id,
    branchName: row.branch_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    startTime: formatTime(row.start_time),
    endTime: formatTime(row.end_time),
  };
}

function validateInput(input: ShiftInput) {
  const name = input.name.trim();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  if (!name || !input.branchId || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return { error: "Shift name, branch, start and end time are required." };
  }
  if (startTime === endTime) {
    return { error: "Start and end time cannot be the same." };
  }
  return {
    name,
    branchId: input.branchId,
    departmentId: input.departmentId,
    startTime,
    endTime,
  };
}

async function lookupBelongsToCompany(
  companyId: number,
  branchId: number,
  departmentId: number | null,
) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("branchId", sql.Int, branchId)
    .input("departmentId", sql.Int, departmentId)
    .query<{ branch_ok: number; department_ok: number }>(`
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1 FROM dbo.branches
            WHERE id = @branchId AND company_id = @companyId
          ) THEN 1
          ELSE 0
        END AS branch_ok,
        CASE
          WHEN @departmentId IS NULL THEN 1
          WHEN EXISTS (
            SELECT 1 FROM dbo.departments
            WHERE id = @departmentId AND company_id = @companyId
          ) THEN 1
          ELSE 0
        END AS department_ok
    `);
  const row = result.recordset[0];
  if (!row.branch_ok) {
    return { error: "Branch not found." };
  }
  if (!row.department_ok) {
    return { error: "Department not found." };
  }
  return {};
}

async function findDuplicate(
  companyId: number,
  name: string,
  branchId: number,
  departmentId: number | null,
  excludeId: number,
) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("companyId", sql.Int, companyId)
    .input("name", sql.NVarChar(200), name)
    .input("branchId", sql.Int, branchId)
    .input("departmentId", sql.Int, departmentId)
    .input("excludeId", sql.Int, excludeId)
    .query<{ id: number }>(`
      SELECT s.id
      FROM dbo.shifts AS s
      WHERE s.company_id = @companyId
        AND s.branch_id = @branchId
        AND (
          (s.department_id IS NULL AND @departmentId IS NULL)
          OR s.department_id = @departmentId
        )
        AND LOWER(s.name) = LOWER(@name)
        AND s.id <> @excludeId
    `);
  return Boolean(result.recordset[0]);
}

const DUPLICATE_MESSAGE =
  "A shift with this name already exists for this branch and department.";

export async function listShiftFormOptions() {
  const empty = {
    branches: [] as ShiftLookupOption[],
    departments: [] as ShiftLookupOption[],
  };
  const session = await requireCompany("view");
  if ("error" in session) {
    return empty;
  }

  const pool = await getPool();
  const companyId = session.company.id;
  const [branches, departments] = await Promise.all([
    pool.request().input("companyId", sql.Int, companyId).query<ShiftLookupOption>(`
      SELECT b.id, b.name
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId AND b.is_active = 1
      ORDER BY b.name
    `),
    pool.request().input("companyId", sql.Int, companyId).query<ShiftLookupOption>(`
      SELECT d.id, d.name
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId AND d.is_active = 1
      ORDER BY d.name
    `),
  ]);

  return {
    branches: branches.recordset,
    departments: departments.recordset,
  };
}

export async function listShifts(query: ShiftListQuery) {
  const session = await requireCompany("view");
  if ("error" in session) {
    return { rows: [], totalCount: 0 };
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.shiftName;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const offset = (query.page - 1) * query.pageSize;
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      ${SHIFT_FROM}
      WHERE s.company_id = @companyId
      ${SHIFT_SEARCH}
    `);
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<ShiftSqlRow>(`
      SELECT
        s.id,
        s.name,
        s.branch_id,
        b.name AS branch_name,
        s.department_id,
        ISNULL(d.name, N'${ALL_DEPARTMENTS}') AS department_name,
        s.start_time,
        s.end_time
      ${SHIFT_FROM}
      WHERE s.company_id = @companyId
      ${SHIFT_SEARCH}
      ORDER BY ${sortColumn} ${direction}, s.id ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapShift),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listShiftsForExport(
  query: Omit<ShiftListQuery, "page" | "pageSize">,
) {
  const session = await requireCompany("view");
  if ("error" in session) {
    return [];
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.shiftName;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;
  const pool = await getPool();
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<ShiftSqlRow>(`
      SELECT
        s.id,
        s.name,
        s.branch_id,
        b.name AS branch_name,
        s.department_id,
        ISNULL(d.name, N'${ALL_DEPARTMENTS}') AS department_name,
        s.start_time,
        s.end_time
      ${SHIFT_FROM}
      WHERE s.company_id = @companyId
      ${SHIFT_SEARCH}
      ORDER BY ${sortColumn} ${direction}, s.id ASC
    `);
  return listResult.recordset.map(mapShift);
}

async function saveShift(
  companyId: number,
  actorId: number,
  input: Exclude<ReturnType<typeof validateInput>, { error: string }>,
  id: number | null,
) {
  const duplicate = await findDuplicate(
    companyId,
    input.name,
    input.branchId,
    input.departmentId,
    id ?? 0,
  );
  if (duplicate) {
    return { error: DUPLICATE_MESSAGE };
  }

  const lookup = await lookupBelongsToCompany(companyId, input.branchId, input.departmentId);
  if ("error" in lookup) {
    return lookup;
  }

  const pool = await getPool();
  try {
    if (id === null) {
      const result = await pool
        .request()
        .input("companyId", sql.Int, companyId)
        .input("name", sql.NVarChar(200), input.name)
        .input("branchId", sql.Int, input.branchId)
        .input("departmentId", sql.Int, input.departmentId)
        .input("startTime", sql.NVarChar(5), input.startTime)
        .input("endTime", sql.NVarChar(5), input.endTime)
        .input("actorId", sql.Int, actorId)
        .query<{ id: number }>(`
          INSERT INTO dbo.shifts (
            company_id, name, branch_id, department_id, start_time, end_time,
            created_by, updated_by
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @name, @branchId, @departmentId,
            CAST(@startTime AS time(0)), CAST(@endTime AS time(0)),
            @actorId, @actorId
          )
        `);
      return { id: result.recordset[0].id };
    }

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, companyId)
      .input("name", sql.NVarChar(200), input.name)
      .input("branchId", sql.Int, input.branchId)
      .input("departmentId", sql.Int, input.departmentId)
      .input("startTime", sql.NVarChar(5), input.startTime)
      .input("endTime", sql.NVarChar(5), input.endTime)
      .input("actorId", sql.Int, actorId)
      .query(`
        UPDATE dbo.shifts
        SET
          name = @name,
          branch_id = @branchId,
          department_id = @departmentId,
          start_time = CAST(@startTime AS time(0)),
          end_time = CAST(@endTime AS time(0)),
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);
    if (!result.rowsAffected[0]) {
      return { error: "Shift not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: DUPLICATE_MESSAGE };
    }
    throw error;
  }
}

export async function createShift(input: ShiftInput) {
  const session = await requireCompany("create");
  if ("error" in session) {
    return session;
  }
  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }
  return saveShift(session.company.id, session.user.id, parsed, null);
}

export async function updateShift(id: number, input: ShiftInput) {
  const session = await requireCompany("edit");
  if ("error" in session) {
    return session;
  }
  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }
  return saveShift(session.company.id, session.user.id, parsed, id);
}

export async function deleteShift(id: number) {
  const session = await requireCompany("delete");
  if ("error" in session) {
    return session;
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query(`
      DELETE FROM dbo.shifts
      WHERE id = @id
        AND company_id = @companyId
    `);
  if (!result.rowsAffected[0]) {
    return { error: "Shift not found." };
  }
  return { id };
}
