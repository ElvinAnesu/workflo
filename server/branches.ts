import "server-only";
import type { AccessAction } from "@/lib/access";
import { requireAnyFeature, requireFeature } from "./access";
import { getPool, sql } from "./db";
import type { SessionDTO } from "./session";

type CompanySession = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export type BranchRow = {
  id: number;
  name: string;
  location: string;
  isActive: boolean;
};

export type BranchInput = {
  name: string;
  location: string;
};

export type BranchListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  name: "b.name",
  location: "b.location",
  isActive: "b.is_active",
};

function isUniqueError(error: unknown) {
  const number =
    error && typeof error === "object" && "number" in error
      ? Number((error as { number: unknown }).number)
      : NaN;
  return number === 2627 || number === 2601;
}

function requireCompany(action: AccessAction) {
  return requireFeature("branches", action);
}

function mapBranch(row: {
  id: number;
  name: string;
  location: string | null;
  is_active: boolean;
}): BranchRow {
  return {
    id: row.id,
    name: row.name,
    location: row.location ?? "",
    isActive: Boolean(row.is_active),
  };
}

function validateInput(input: BranchInput) {
  const name = input.name.trim();
  if (!name) {
    return { error: "Branch name is required." };
  }
  return { name, location: input.location.trim() };
}

const BRANCH_SEARCH = `
        AND (
          @search = N'%%'
          OR b.name LIKE @search
          OR ISNULL(b.location, N'') LIKE @search
        )
`;

export async function listBranches(query: BranchListQuery) {
  const session = await requireCompany("view");
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
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId
      ${BRANCH_SEARCH}
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
      location: string | null;
      is_active: boolean;
    }>(`
      SELECT b.id, b.name, b.location, b.is_active
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId
      ${BRANCH_SEARCH}
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapBranch),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listBranchesForExport(
  query: Omit<BranchListQuery, "page" | "pageSize">,
) {
  const session = await requireCompany("view");
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
      location: string | null;
      is_active: boolean;
    }>(`
      SELECT b.id, b.name, b.location, b.is_active
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId
      ${BRANCH_SEARCH}
      ORDER BY ${sortColumn} ${direction}
    `);

  return listResult.recordset.map(mapBranch);
}

export async function createBranch(input: BranchInput) {
  const session = await requireCompany("create");
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
      .input("location", sql.NVarChar(200), parsed.location || null)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.branches (company_id, name, location, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, @location, @actorId, @actorId)
      `);

    return { id: result.recordset[0].id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: "A branch with this name already exists." };
    }
    throw error;
  }
}

export async function updateBranch(id: number, input: BranchInput) {
  const session = await requireCompany("edit");
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
      .input("location", sql.NVarChar(200), parsed.location || null)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.branches
        SET
          name = @name,
          location = @location,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
          AND company_id = @companyId
      `);

    if (!result.rowsAffected[0]) {
      return { error: "Branch not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: "A branch with this name already exists." };
    }
    throw error;
  }
}

export async function setBranchActive(id: number, isActive: boolean) {
  const session = await requireCompany("edit");
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
      UPDATE dbo.branches
      SET
        is_active = @isActive,
        updated_at = SYSUTCDATETIME(),
        updated_by = @actorId
      WHERE id = @id
        AND company_id = @companyId
    `);

  if (!result.rowsAffected[0]) {
    return { error: "Branch not found." };
  }

  return { id };
}

export async function importBranches(
  records: { name: string; location: string }[],
  dryRun: boolean,
) {
  const session = await requireCompany("create");
  if ("error" in session) {
    return { problems: [session.error] };
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const rows: { name: string; location: string }[] = [];

  records.forEach((record, index) => {
    const name = record.name.trim();
    const location = record.location.trim();
    const rowLabel = `Row ${index + 2}`;
    if (!name) {
      problems.push(`${rowLabel}: Branch name is required.`);
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push(`${rowLabel}: "${name}" appears twice in the file.`);
      return;
    }
    seen.add(key);
    rows.push({ name, location });
  });

  if (problems.length > 0) {
    return { problems };
  }

  const pool = await getPool();
  const existing = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .query<{ name: string }>(`
      SELECT b.name
      FROM dbo.branches AS b
      WHERE b.company_id = @companyId
    `);

  const existingNames = new Set(
    existing.recordset.map((row) => row.name.toLowerCase()),
  );
  rows.forEach((row, index) => {
    if (existingNames.has(row.name.toLowerCase())) {
      problems.push(`Row ${index + 2}: "${row.name}" already exists.`);
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
        .input("location", sql.NVarChar(200), row.location || null)
        .input("actorId", sql.Int, session.user.id)
        .query(`
          INSERT INTO dbo.branches (company_id, name, location, created_by, updated_by)
          VALUES (@companyId, @name, @location, @actorId, @actorId)
        `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { problems: ["A branch with this name already exists."] };
    }
    throw error;
  }

  return { problems: [] };
}
