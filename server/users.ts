import "server-only";
import { can, type AccessAction } from "@/lib/access";
import { getPool, sql } from "./db";
import { hashPassword } from "./password";
import { getAssignableRole } from "./roles";
import { getSession } from "./session";

export type UserRow = {
  id: number;
  username: string;
  email: string;
  fullName: string;
  roleId: number | null;
  roleName: string;
  isSuperUser: boolean;
  isActive: boolean;
};

export type UserInput = {
  username: string;
  email: string;
  fullName: string;
  roleId: number;
  isSuperUser: boolean;
  password?: string;
};

export type UserListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  username: "u.username",
  email: "u.email",
  fullName: "u.full_name",
  roleName: "r.name",
  isSuperUser: "u.is_super_user",
  isActive: "u.is_active",
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 8;

function isUniqueError(error: unknown) {
  const number =
    error && typeof error === "object" && "number" in error
      ? Number((error as { number: unknown }).number)
      : NaN;
  return number === 2627 || number === 2601;
}

function uniqueUserMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  if (message.includes("uq_users_email")) {
    return "A user with this email already exists.";
  }
  if (message.includes("uq_users_username")) {
    return "A user with this username already exists.";
  }
  return "A user with this username or email already exists.";
}

async function requireUser(action: AccessAction) {
  const session = await getSession();
  if (!session || !session.company) {
    return null;
  }
  if (!can(session.access, "users", action)) {
    return null;
  }
  return session;
}

function mapUser(row: {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role_id: number | null;
  role_name: string | null;
  is_super_user: boolean;
  is_active: boolean;
}): UserRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name ?? "",
    roleId: row.role_id,
    roleName: row.role_name ?? "",
    isSuperUser: Boolean(row.is_super_user),
    isActive: Boolean(row.is_active),
  };
}

function validateInput(input: UserInput, requirePassword: boolean) {
  const username = input.username.trim();
  const email = input.email.trim();
  const fullName = input.fullName.trim();
  const password = input.password ?? "";

  if (!username) {
    return { error: "Username is required." };
  }
  if (!email) {
    return { error: "Email is required." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (requirePassword || password) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
  }

  const roleId = Number(input.roleId);
  if (!Number.isInteger(roleId) || roleId < 1) {
    return { error: "Role is required." };
  }

  return {
    username,
    email,
    fullName,
    roleId,
    isSuperUser: Boolean(input.isSuperUser),
    password,
  };
}

async function assertRoleAssignable(roleId: number, currentRoleId: number | null) {
  const role = await getAssignableRole(roleId);
  if (!role) {
    return { error: "Role not found." };
  }
  if (!role.isActive && role.id !== currentRoleId) {
    return { error: "This role is inactive." };
  }
  return { roleId };
}

const USER_FROM = `
      FROM dbo.user_companies AS uc
      INNER JOIN dbo.users AS u ON u.id = uc.user_id
      LEFT JOIN dbo.roles AS r ON r.id = u.role_id
`;

const USER_SEARCH = `
        AND (
          @search = N'%%'
          OR u.username LIKE @search
          OR u.email LIKE @search
          OR ISNULL(u.full_name, N'') LIKE @search
          OR ISNULL(r.name, N'') LIKE @search
        )
`;

const USER_SELECT = `
      SELECT u.id, u.username, u.email, u.full_name, u.role_id, r.name AS role_name,
             u.is_super_user, u.is_active
`;

export async function listUsers(query: UserListQuery) {
  const session = await requireUser("view");
  if (!session?.company) {
    return { rows: [], totalCount: 0 };
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.username;
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
      ${USER_FROM}
      WHERE uc.company_id = @companyId
      ${USER_SEARCH}
    `);

  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      role_id: number | null;
      role_name: string | null;
      is_super_user: boolean;
      is_active: boolean;
    }>(`
      ${USER_SELECT}
      ${USER_FROM}
      WHERE uc.company_id = @companyId
      ${USER_SEARCH}
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: listResult.recordset.map(mapUser),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listUsersForExport(
  query: Omit<UserListQuery, "page" | "pageSize">,
) {
  const session = await requireUser("view");
  if (!session?.company) {
    return [];
  }

  const sortColumn = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.username;
  const direction = query.sortDirection === "desc" ? "DESC" : "ASC";
  const search = `%${query.search.trim()}%`;

  const pool = await getPool();
  const listResult = await pool
    .request()
    .input("companyId", sql.Int, session.company.id)
    .input("search", sql.NVarChar(200), search)
    .query<{
      id: number;
      username: string;
      email: string;
      full_name: string | null;
      role_id: number | null;
      role_name: string | null;
      is_super_user: boolean;
      is_active: boolean;
    }>(`
      ${USER_SELECT}
      ${USER_FROM}
      WHERE uc.company_id = @companyId
      ${USER_SEARCH}
      ORDER BY ${sortColumn} ${direction}
    `);

  return listResult.recordset.map(mapUser);
}

export async function createUser(input: UserInput) {
  const session = await requireUser("create");
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }

  const parsed = validateInput(input, true);
  if ("error" in parsed) {
    return parsed;
  }

  const roleCheck = await assertRoleAssignable(parsed.roleId, null);
  if ("error" in roleCheck) {
    return roleCheck;
  }

  const passwordHash = await hashPassword(parsed.password);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let createdId = 0;

  try {
    const insert = await new sql.Request(transaction)
      .input("username", sql.NVarChar(100), parsed.username)
      .input("email", sql.NVarChar(256), parsed.email)
      .input("fullName", sql.NVarChar(200), parsed.fullName || null)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("isSuperUser", sql.Bit, parsed.isSuperUser)
      .input("roleId", sql.Int, parsed.roleId)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.users (username, email, full_name, password_hash, is_super_user, role_id, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@username, @email, @fullName, @passwordHash, @isSuperUser, @roleId, @actorId, @actorId)
      `);

    const id = insert.recordset[0].id;

    await new sql.Request(transaction)
      .input("userId", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        INSERT INTO dbo.user_companies (user_id, company_id, created_by)
        VALUES (@userId, @companyId, @actorId)
      `);

    await transaction.commit();
    createdId = id;
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: uniqueUserMessage(error) };
    }
    throw error;
  }

  return { id: createdId };
}

export async function updateUser(id: number, input: UserInput) {
  const session = await requireUser("edit");
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }

  const parsed = validateInput(input, false);
  if ("error" in parsed) {
    return parsed;
  }

  const pool = await getPool();
  const currentResult = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .query<{ role_id: number | null }>(`
      SELECT u.role_id
      FROM dbo.users AS u
      INNER JOIN dbo.user_companies AS uc
        ON uc.user_id = u.id AND uc.company_id = @companyId
      WHERE u.id = @id
    `);
  const current = currentResult.recordset[0];
  if (!current) {
    return { error: "User not found." };
  }

  const roleCheck = await assertRoleAssignable(parsed.roleId, current.role_id);
  if ("error" in roleCheck) {
    return roleCheck;
  }

  const passwordHash = parsed.password
    ? await hashPassword(parsed.password)
    : null;

  try {
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("companyId", sql.Int, session.company.id)
      .input("actorId", sql.Int, session.user.id)
      .input("username", sql.NVarChar(100), parsed.username)
      .input("email", sql.NVarChar(256), parsed.email)
      .input("fullName", sql.NVarChar(200), parsed.fullName || null)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("isSuperUser", sql.Bit, parsed.isSuperUser)
      .input("roleId", sql.Int, parsed.roleId)
      .query(`
        UPDATE u
        SET
          u.username = @username,
          u.email = @email,
          u.full_name = @fullName,
          u.password_hash = COALESCE(@passwordHash, u.password_hash),
          u.is_super_user = @isSuperUser,
          u.role_id = @roleId,
          u.updated_at = SYSUTCDATETIME(),
          u.updated_by = @actorId
        FROM dbo.users AS u
        INNER JOIN dbo.user_companies AS uc
          ON uc.user_id = u.id AND uc.company_id = @companyId
        WHERE u.id = @id
      `);

    if (!result.rowsAffected[0]) {
      return { error: "User not found." };
    }
    return { id };
  } catch (error) {
    if (isUniqueError(error)) {
      return { error: uniqueUserMessage(error) };
    }
    throw error;
  }
}

export async function setUserActive(id: number, isActive: boolean) {
  const session = await requireUser("edit");
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }
  if (!isActive && id === session.user.id) {
    return { error: "You cannot deactivate your own account." };
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("companyId", sql.Int, session.company.id)
    .input("actorId", sql.Int, session.user.id)
    .input("isActive", sql.Bit, isActive)
    .query(`
      UPDATE u
      SET
        u.is_active = @isActive,
        u.updated_at = SYSUTCDATETIME(),
        u.updated_by = @actorId
      FROM dbo.users AS u
      INNER JOIN dbo.user_companies AS uc
        ON uc.user_id = u.id AND uc.company_id = @companyId
      WHERE u.id = @id
    `);

  if (!result.rowsAffected[0]) {
    return { error: "User not found." };
  }

  return { id };
}
