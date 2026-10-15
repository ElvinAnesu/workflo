import "server-only";
import { getPool, sql } from "./db";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type DepartmentRow = {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
};

export type DepartmentInput = {
  name: string;
  code: string;
};

export type DepartmentListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  name: "d.name",
  code: "d.description",
  isActive: "d.is_active",
};

function isUniqueError(error: unknown) {
  const number =
    error && typeof error === "object" && "number" in error
      ? Number((error as { number: unknown }).number)
      : NaN;
  return number === 2627 || number === 2601;
}

function uniqueDepartmentMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  if (message.includes("uq_departments_company_code")) {
    return "A department with this description already exists.";
  }
  return "A department with this name already exists.";
}

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

function mapDepartment(row: {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}): DepartmentRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    isActive: Boolean(row.is_active),
  };
}

function validateInput(input: DepartmentInput) {
  const name = input.name.trim();
  if (!name) {
    return { error: "Department name is required." };
  }
  return { name, code: input.code.trim() };
}

const DEPARTMENT_SEARCH = `
        AND (
          @search = N'%%'
          OR d.name LIKE @search
          OR ISNULL(d.description, N'') LIKE @search
        )
`;

export async function listDepartments(query: DepartmentListQuery) {
  const session = await requireCompany();
  if ("error" in session) {
    return { rows: [], totalCount: 0 };
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.name;
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
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId
      ${DEPARTMENT_SEARCH}
    `);

  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{
      id: number;
      name: string;
      code: string | null;
      is_active: boolean;
    }>(`
      SELECT d.id, d.name, d.description AS code, d.is_active
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId
      ${DEPARTMENT_SEARCH}
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapDepartment),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listDepartmentsForExport(
  query: Omit<DepartmentListQuery, "page" | "pageSize">,
) {
  const session = await requireCompany();
  if ("error" in session) {
    return [];
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.name;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;

  const pool = await getPool();
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<{
      id: number;
      name: string;
      code: string | null;
      is_active: boolean;
    }>(`
      SELECT d.id, d.name, d.description AS code, d.is_active
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId
      ${DEPARTMENT_SEARCH}
      ORDER BY ${sortColumn} ${direction}
    `);

  return listResult.recordset.map(mapDepartment);
}

export async function createDepartment(input: DepartmentInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }

  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("companyId", sql.Int, session.company.id)
      .input("name", sql.NVarChar(200), parsed.name)
      .input("code", sql.NVarChar(50), parsed.code || null)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.departments (company_id, name, description, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, @code, @actorId, @actorId)
      `);

    return { id: result.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: uniqueDepartmentMessage(error) };
    }
    throw error;
  }
}

export async function updateDepartment(id: number, input: DepartmentInput) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }

  const parsed = validateInput(input);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("name", sql.NVarChar(200), parsed.name)
      .input("code", sql.NVarChar(50), parsed.code || null)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.departments
        SET
          name = @name,
          description = @code,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);

    if (!result.rowsAffected[0]) {
      return { error: "Department not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: uniqueDepartmentMessage(error) };
    }
    throw error;
  }
}

export async function setDepartmentActive(id: number, isActive: boolean) {
  const session = await requireCompany();
  if ("error" in session) {
    return session;
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("actorId", sql.Int, session.user.id)
    .input("isActive", sql.Bit, isActive)
    .query(`
      UPDATE dbo.departments
      SET
        is_active = @isActive,
        updated_at = SYSUTCDATETIME(),
        updated_by = @actorId
      WHERE id = @id
        AND company_id = @companyId
    `);

  if (!result.rowsAffected[0]) {
    return { error: "Department not found." };
  }

  return { id };
}

export async function importDepartments(
  records: { name: string; code: string }[],
  dryRun: boolean,
) {
  const session = await requireCompany();
  if ("error" in session) {
    return { problems: [session.error] };
  }

  const problems: string[] = [];
  const seenNames = new Set<string>();
  const seenCodes = new Set<string>();
  const rows: { name: string; code: string }[] = [];

  records.forEach((record, index) => {
    const name = record.name.trim();
    const code = record.code.trim();
    const rowLabel = `Row ${index + 2}`;
    if (!name) {
      problems.push(`${rowLabel}: Department name is required.`);
      return;
    }
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      problems.push(`${rowLabel}: "${name}" appears twice in the file.`);
      return;
    }
    seenNames.add(nameKey);
    if (code) {
      const codeKey = code.toLowerCase();
      if (seenCodes.has(codeKey)) {
        problems.push(`${rowLabel}: description "${code}" appears twice in the file.`);
        return;
      }
      seenCodes.add(codeKey);
    }
    rows.push({ name, code });
  });

  if (problems.length > 0) {
    return { problems };
  }

  const pool = await getPool();
  const existing = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .query<{ name: string; code: string | null }>(`
      SELECT d.name, d.description AS code
      FROM dbo.departments AS d
      WHERE d.company_id = @companyId
    `);

  const existingNames = new Set(
    existing.recordset.map((row) => row.name.toLowerCase()),
  );
  const existingCodes = new Set(
    existing.recordset
      .map((row) => row.code?.toLowerCase())
      .filter((code): code is string => Boolean(code)),
  );

  rows.forEach((row, index) => {
    const rowLabel = `Row ${index + 2}`;
    if (existingNames.has(row.name.toLowerCase())) {
      problems.push(`${rowLabel}: "${row.name}" already exists.`);
    }
    if (row.code && existingCodes.has(row.code.toLowerCase())) {
      problems.push(`${rowLabel}: description "${row.code}" already exists.`);
    }
  });

  if (problems.length > 0 || dryRun) {
    return { problems };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const row of rows) {
      await new sql.Request(transaction)
        .input("companyId", sql.Int, session.company.id)
        .input("name", sql.NVarChar(200), row.name)
        .input("code", sql.NVarChar(50), row.code || null)
        .input("actorId", sql.Int, session.user.id)
        .query(`
          INSERT INTO dbo.departments (company_id, name, description, created_by, updated_by)
          VALUES (@companyId, @name, @code, @actorId, @actorId)
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { problems: [uniqueDepartmentMessage(error)] };
    }
    throw error;
  }

  return { problems: [] };
}
