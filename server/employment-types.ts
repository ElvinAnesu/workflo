import "server-only";
import { getPool, sql } from "./db";
import { getSession, type SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type EmploymentTypeRow = {
  id: number;
  name: string;
};

export type EmploymentTypeInput = {
  name: string;
};

export type EmploymentTypeListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  name: "t.name",
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

function isForeignKeyError(error: unknown) {
  return errorNumber(error) === 547;
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

function mapRow(row: { id: number; name: string }): EmploymentTypeRow {
  return { id: row.id, name: row.name };
}

function validateInput(input: EmploymentTypeInput) {
  const name = input.name.trim();
  if (!name) {
    return { error: "Employment type name is required." };
  }
  return { name };
}

const NAME_SEARCH = `
        AND (
          @search = N'%%'
          OR t.name LIKE @search
        )
`;

export async function listEmploymentTypes(query: EmploymentTypeListQuery) {
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
      FROM dbo.employment_types AS t
      WHERE t.company_id = @companyId
      ${NAME_SEARCH}
    `);

  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{ id: number; name: string }>(`
      SELECT t.id, t.name
      FROM dbo.employment_types AS t
      WHERE t.company_id = @companyId
      ${NAME_SEARCH}
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapRow),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listEmploymentTypesForExport(
  query: Omit<EmploymentTypeListQuery, "page" | "pageSize">,
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
    .query<{ id: number; name: string }>(`
      SELECT t.id, t.name
      FROM dbo.employment_types AS t
      WHERE t.company_id = @companyId
      ${NAME_SEARCH}
      ORDER BY ${sortColumn} ${direction}
    `);

  return listResult.recordset.map(mapRow);
}

export async function createEmploymentType(input: EmploymentTypeInput) {
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
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.employment_types (company_id, name, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, @actorId, @actorId)
      `);

    return { id: result.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: "An employment type with this name already exists." };
    }
    throw error;
  }
}

export async function updateEmploymentType(id: number, input: EmploymentTypeInput) {
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
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.employment_types
        SET
          name = @name,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);

    if (!result.rowsAffected[0]) {
      return { error: "Employment type not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: "An employment type with this name already exists." };
    }
    throw error;
  }
}

export async function deleteEmploymentType(id: number) {
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
      .query(`
        DELETE FROM dbo.employment_types
        WHERE id = @id
          AND company_id = @companyId
      `);

    if (!result.rowsAffected[0]) {
      return { error: "Employment type not found." };
    }
    return { id };
  } catch (error) {
    if (isForeignKeyError(error)) {
      return { error: "This employment type cannot be deleted. It is used by employees." };
    }
    throw error;
  }
}
