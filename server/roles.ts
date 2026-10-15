import "server-only";
import {
  emptyPermissionActions,
  emptyPermissions,
  PERMISSION_FEATURES,
} from "@/components/roles/permission-features";
import type { RolePermissionActions } from "@/components/roles/role.types";
import { getPool, sql } from "./db";
import { getSession } from "./session";

export type RoleOption = {
  id: number;
  name: string;
  isActive: boolean;
};

export type RoleRow = {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  userCount: number;
  featureCount: number;
  permissions: Record<string, RolePermissionActions>;
};

export type RoleInput = {
  name: string;
  description: string;
  permissions: Record<string, RolePermissionActions>;
};

export type RoleListQuery = {
  search: string;
  page: number;
  pageSize: number;
  sortKey: string;
  sortDirection: "asc" | "desc";
};

const SORT_COLUMNS: Record<string, string> = {
  name: "r.name",
  description: "r.description",
  isActive: "r.is_active",
  userCount: "user_count",
  featureCount: "feature_count",
};

const ROLE_LIST_COLUMNS = `
  r.id,
  r.name,
  r.description,
  r.is_active,
  (
    SELECT COUNT(*)
    FROM dbo.users AS u
    WHERE u.role_id = r.id
  ) AS user_count,
  (
    SELECT COUNT(*)
    FROM dbo.role_permissions AS rp
    WHERE rp.role_id = r.id
      AND rp.can_read = 1
  ) AS feature_count
`;

function isUniqueError(error: unknown) {
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

function mapRole(row: {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  user_count: number;
  feature_count: number;
}): Omit<RoleRow, "permissions"> {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    isActive: Boolean(row.is_active),
    userCount: Number(row.user_count) || 0,
    featureCount: Number(row.feature_count) || 0,
  };
}

function rowToActions(row: {
  can_read: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_run: boolean;
  can_approve: boolean;
  feature_key: string;
}): RolePermissionActions {
  const feature = PERMISSION_FEATURES.find((item) => item.key === row.feature_key);
  return {
    view: Boolean(row.can_read),
    create: Boolean(row.can_insert),
    edit: Boolean(row.can_update),
    delete: Boolean(row.can_delete),
    ...(feature?.hasRun ? { run: Boolean(row.can_run) } : {}),
    ...(feature?.hasApprove ? { approve: Boolean(row.can_approve) } : {}),
  };
}

async function loadPermissions(
  roleIds: number[],
): Promise<Map<number, Record<string, RolePermissionActions>>> {
  const byRole = new Map<number, Record<string, RolePermissionActions>>();
  for (const id of roleIds) {
    byRole.set(id, emptyPermissions());
  }
  if (roleIds.length === 0) {
    return byRole;
  }

  const idList = roleIds.filter((id) => Number.isInteger(id)).join(", ");
  if (!idList) {
    return byRole;
  }

  const pool = await getPool();
  const result = await pool.request().query<{
    role_id: number;
    feature_key: string;
    can_read: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_run: boolean;
    can_approve: boolean;
  }>(`
    SELECT role_id, feature_key, can_read, can_insert, can_update, can_delete,
           can_run, can_approve
    FROM dbo.role_permissions
    WHERE role_id IN (${idList})
  `);

  for (const row of result.recordset) {
    const permissions = byRole.get(row.role_id) ?? emptyPermissions();
    permissions[row.feature_key] = rowToActions(row);
    byRole.set(row.role_id, permissions);
  }

  return byRole;
}

async function withPermissions(
  rows: Omit<RoleRow, "permissions">[],
): Promise<RoleRow[]> {
  const permissionsByRole = await loadPermissions(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    permissions: permissionsByRole.get(row.id) ?? emptyPermissions(),
  }));
}

async function replacePermissions(
  transaction: sql.Transaction,
  roleId: number,
  actorId: number,
  permissions: Record<string, RolePermissionActions>,
) {
  await new sql.Request(transaction)
    .input("roleId", sql.Int, roleId)
    .query(`
      DELETE FROM dbo.role_permissions
      WHERE role_id = @roleId
    `);

  for (const feature of PERMISSION_FEATURES) {
    const actions =
      permissions[feature.key] ??
      emptyPermissionActions(feature.hasRun, feature.hasApprove);
    await new sql.Request(transaction)
      .input("roleId", sql.Int, roleId)
      .input("featureKey", sql.NVarChar(100), feature.key)
      .input("canRead", sql.Bit, Boolean(actions.view))
      .input("canInsert", sql.Bit, Boolean(actions.create))
      .input("canUpdate", sql.Bit, Boolean(actions.edit))
      .input("canDelete", sql.Bit, Boolean(actions.delete))
      .input("canRun", sql.Bit, feature.hasRun ? Boolean(actions.run) : false)
      .input("canApprove", sql.Bit, feature.hasApprove ? Boolean(actions.approve) : false)
      .input("actorId", sql.Int, actorId)
      .query(`
        INSERT INTO dbo.role_permissions (
          role_id, feature_key, can_read, can_insert, can_update, can_delete,
          can_run, can_approve, created_by
        )
        VALUES (
          @roleId, @featureKey, @canRead, @canInsert, @canUpdate, @canDelete,
          @canRun, @canApprove, @actorId
        )
      `);
  }
}

export async function listRolesForSelect(selectedId?: number | null) {
  const session = await requireUser();
  if (!session) {
    return [];
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("selectedId", sql.Int, selectedId ?? 0)
    .query<{ id: number; name: string; is_active: boolean }>(`
      SELECT r.id, r.name, r.is_active
      FROM dbo.roles AS r
      WHERE r.is_active = 1
         OR r.id = @selectedId
      ORDER BY r.name
    `);

  return result.recordset.map(
    (row): RoleOption => ({
      id: row.id,
      name: row.name,
      isActive: Boolean(row.is_active),
    }),
  );
}

export async function getAssignableRole(id: number) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query<{ id: number; is_active: boolean }>(`
      SELECT r.id, r.is_active
      FROM dbo.roles AS r
      WHERE r.id = @id
    `);

  return result.recordset[0]
    ? {
        id: result.recordset[0].id,
        isActive: Boolean(result.recordset[0].is_active),
      }
    : null;
}

export async function listRoles(query: RoleListQuery) {
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
    .input("search", sql.NVarChar(200), search)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM dbo.roles AS r
      WHERE
        @search = N'%%'
        OR r.name LIKE @search
        OR ISNULL(r.description, N'') LIKE @search
    `);

  const listResult = await pool
    .request()
    .input("search", sql.NVarChar(200), search)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, query.pageSize)
    .query<{
      id: number;
      name: string;
      description: string | null;
      is_active: boolean;
      user_count: number;
      feature_count: number;
    }>(`
      SELECT ${ROLE_LIST_COLUMNS}
      FROM dbo.roles AS r
      WHERE
        @search = N'%%'
        OR r.name LIKE @search
        OR ISNULL(r.description, N'') LIKE @search
      ORDER BY ${sortColumn} ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  return {
    rows: await withPermissions(listResult.recordset.map(mapRole)),
    totalCount: countResult.recordset[0]?.total ?? 0,
  };
}

export async function listRolesForExport(
  query: Omit<RoleListQuery, "page" | "pageSize">,
) {
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
    .input("search", sql.NVarChar(200), search)
    .query<{
      id: number;
      name: string;
      description: string | null;
      is_active: boolean;
      user_count: number;
      feature_count: number;
    }>(`
      SELECT ${ROLE_LIST_COLUMNS}
      FROM dbo.roles AS r
      WHERE
        @search = N'%%'
        OR r.name LIKE @search
        OR ISNULL(r.description, N'') LIKE @search
      ORDER BY ${sortColumn} ${direction}
    `);

  return withPermissions(listResult.recordset.map(mapRole));
}

export async function createRole(input: RoleInput) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "Role name is required." };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let createdId = 0;

  try {
    const result = await new sql.Request(transaction)
      .input("name", sql.NVarChar(200), name)
      .input("description", sql.NVarChar(500), input.description.trim() || null)
      .input("actorId", sql.Int, session.user.id)
      .query<{ id: number }>(`
        INSERT INTO dbo.roles (name, description, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@name, @description, @actorId, @actorId)
      `);

    const id = result.recordset[0].id;
    await replacePermissions(
      transaction,
      id,
      session.user.id,
      input.permissions ?? emptyPermissions(),
    );
    await transaction.commit();
    createdId = id;
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: "A role with this name already exists." };
    }
    throw error;
  }

  return { id: createdId };
}

export async function updateRole(id: number, input: RoleInput) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "Role name is required." };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("name", sql.NVarChar(200), name)
      .input("description", sql.NVarChar(500), input.description.trim() || null)
      .input("actorId", sql.Int, session.user.id)
      .query(`
        UPDATE dbo.roles
        SET
          name = @name,
          description = @description,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actorId
        WHERE id = @id
      `);

    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Role not found." };
    }

    await replacePermissions(
      transaction,
      id,
      session.user.id,
      input.permissions ?? emptyPermissions(),
    );
    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    if (isUniqueError(error)) {
      return { error: "A role with this name already exists." };
    }
    throw error;
  }
}

export async function deleteRole(id: number) {
  const session = await requireUser();
  if (!session) {
    return { error: "No signed-in user." };
  }

  const pool = await getPool();
  const assigned = await pool
    .request()
    .input("id", sql.Int, id)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM dbo.users AS u
      WHERE u.role_id = @id
    `);

  if ((assigned.recordset[0]?.total ?? 0) > 0) {
    return { error: "This role is assigned to users." };
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).input("id", sql.Int, id).query(`
      DELETE FROM dbo.role_permissions
      WHERE role_id = @id
    `);

    const result = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.roles
        WHERE id = @id
      `);

    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return { error: "Role not found." };
    }

    await transaction.commit();
    return { id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
