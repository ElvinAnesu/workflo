import "server-only";
import { getPool, sql } from "./db";
import { writeCompanyCookie } from "./company-cookie";
import { getSession } from "./session";

export type CompanyRow = {
  id: number;
  name: string;
  country: string;
  address: string;
  isActive: boolean;
};

export type CompanyInput = {
  name: string;
  country: string;
  address: string;
};

export type CompanyListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  name: "c.name",
  country: "c.country",
  address: "c.address",
  isActive: "c.is_active",
};

function isUniqueNameError(error: unknown) {
  const number =
    error && typeof error === "object" && "number" in error
      ? Number((error as { number: unknown }).number)
      : NaN;
  return number === 2627 || number === 2601;
}

async function requireUser() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  return session;
}

export async function listCompanies(query: CompanyListQuery) {
  const session = await requireUser();
  if (!session) {
    return { rows: [], totalCount: 0 };
  }
  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.name;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const offset = (query.page - 1) * query.pageSize;
  const search = `%${query.search.trim()}%`;

  const pool = await getPool();
  const countResult = await pool
    .request()
    .input("userId", sql.Int, session.user.id)
    .input("search", sql.NVarChar(200), search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM dbo.user_companies AS uc
      INNER JOIN dbo.companies AS c ON c.id = uc.company_id
      WHERE uc.user_id = @userId
        AND (
          @search = N'%%'
          OR c.name LIKE @search
          OR ISNULL(c.country, N'') LIKE @search
          OR ISNULL(c.address, N'') LIKE @search
        )
    `);

  const listResult = await pool
    .request()
    .input("userId", sql.Int, session.user.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{
      id: number;
      name: string;
      country: string | null;
      address: string | null;
      is_active: boolean;
    }>(`
      SELECT c.id, c.name, c.country, c.address, c.is_active
      FROM dbo.user_companies AS uc
      INNER JOIN dbo.companies AS c ON c.id = uc.company_id
      WHERE uc.user_id = @userId
        AND (
          @search = N'%%'
          OR c.name LIKE @search
          OR ISNULL(c.country, N'') LIKE @search
          OR ISNULL(c.address, N'') LIKE @search
        )
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(
      (row): CompanyRow => ({
        id: row.id,
        name: row.name,
        country: row.country ?? "",
        address: row.address ?? "",
        isActive: Boolean(row.is_active),
      }),
    ),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listCompaniesForExport(query: Omit<CompanyListQuery, "page" | "pageSize">) {
  const session = await requireUser();
  if (!session) {
    return [];
  }
  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.name;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;

  const pool = await getPool();
  const listResult = await pool
    .request()
    .input("userId", sql.Int, session.user.id)
    .input("search", sql.NVarChar(200), search)
    .query<{
      id: number;
      name: string;
      country: string | null;
      address: string | null;
      is_active: boolean;
    }>(`
      SELECT c.id, c.name, c.country, c.address, c.is_active
      FROM dbo.user_companies AS uc
      INNER JOIN dbo.companies AS c ON c.id = uc.company_id
      WHERE uc.user_id = @userId
        AND (
          @search = N'%%'
          OR c.name LIKE @search
          OR ISNULL(c.country, N'') LIKE @search
          OR ISNULL(c.address, N'') LIKE @search
        )
      ORDER BY ${sortColumn} ${direction}
    `);

  return listResult.recordset.map(
    (row): CompanyRow => ({
      id: row.id,
      name: row.name,
      country: row.country ?? "",
      address: row.address ?? "",
      isActive: Boolean(row.is_active),
    }),
  );
}

export async function getCompany(id: number) {
  const session = await requireUser();
  if (!session?.companies.some((company) => company.id === id)) {
    return null;
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("userId", sql.Int, session.user.id)
    .query<{
      id: number;
      name: string;
      country: string | null;
      address: string | null;
      is_active: boolean;
    }>(`
      SELECT c.id, c.name, c.country, c.address, c.is_active
      FROM dbo.companies AS c
      INNER JOIN dbo.user_companies AS uc
        ON uc.company_id = c.id AND uc.user_id = @userId
      WHERE c.id = @id
    `);

  const row = result.recordset[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    country: row.country ?? "",
    address: row.address ?? "",
    isActive: Boolean(row.is_active),
  } satisfies CompanyRow;
}

export async function createCompany(input: CompanyInput) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }
  const name = input.name.trim();
  if (!name) {
    return { error: "Company name is required." };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let createdId = 0;

  try {
    const insert = await new sql.Request(transaction)
      .input("name", sql.NVarChar(200), name)
      .input("country", sql.NVarChar(100), input.country.trim() || null)
      .input("address", sql.NVarChar(500), input.address.trim() || null)
      .input("userId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.companies (name, country, address, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@name, @country, @address, @userId, @userId)
      `);

    const id = insert.recordset[0].id;

    await new sql.Request(transaction)
      .input("userId", sql.Int, session.user.id)
      .input("companyId", sql.Int, id)
      .query(`
        INSERT INTO dbo.user_companies (user_id, company_id, created_by)
        VALUES (@userId, @companyId, @userId)
      `);

    await transaction.commit();
    createdId = id;
  } catch (error) {
    await transaction.rollback();
    if (isUniqueNameError(error)) {
      return { error: "A company with this name already exists." };
    }
    throw error;
  }

  await writeCompanyCookie(createdId);
  return { id: createdId };
}

export async function updateCompany(id: number, input: CompanyInput) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }
  const name = input.name.trim();
  if (!name) {
    return { error: "Company name is required." };
  }

  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("userId", sql.Int, session.user.id)
      .input("name", sql.NVarChar(200), name)
      .input("country", sql.NVarChar(100), input.country.trim() || null)
      .input("address", sql.NVarChar(500), input.address.trim() || null)
      .query(`
        UPDATE c
        SET
          c.name = @name,
          c.country = @country,
          c.address = @address,
          c.updated_at = SYSUTCDATETIME(),
          c.updated_by = @userId
        FROM dbo.companies AS c
        INNER JOIN dbo.user_companies AS uc
          ON uc.company_id = c.id AND uc.user_id = @userId
        WHERE c.id = @id
      `);

    if (!result.rowsAffected[0]) {
      return { error: "Company not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueNameError(error)) {
      return { error: "A company with this name already exists." };
    }
    throw error;
  }
}

export async function setCompanyActive(id: number, isActive: boolean) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }
  const pool = await getPool();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("userId", sql.Int, session.user.id)
    .input("isActive", sql.Bit, isActive)
    .query(`
      UPDATE c
      SET
        c.is_active = @isActive,
        c.updated_at = SYSUTCDATETIME(),
        c.updated_by = @userId
      FROM dbo.companies AS c
      INNER JOIN dbo.user_companies AS uc
        ON uc.company_id = c.id AND uc.user_id = @userId
      WHERE c.id = @id
    `);

  if (!result.rowsAffected[0]) {
    return { error: "Company not found." };
  }

  if (!isActive && session.company?.id === id) {
    const nextActive = session.companies.find(
      (company) => company.isActive && company.id !== id,
    );
    await writeCompanyCookie(nextActive?.id ?? null);
  }

  return { id };
}

export async function switchCompany(id: number) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }
  const company = session.companies.find((item) => item.id === id);
  if (!company) {
    return { error: "Company not found." };
  }
  if (!company.isActive) {
    return { error: "This company is inactive." };
  }
  await writeCompanyCookie(id);
  return { id };
}
