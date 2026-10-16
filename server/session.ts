import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import {
  emptyPermissionActions,
  emptyPermissions,
  PERMISSION_FEATURES,
} from "@/components/roles/permission-features";
import type { RolePermissionActions } from "@/components/roles/role.types";
import type { AccessSnapshot } from "@/lib/access";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { readCompanyCookie } from "./company-cookie";
import { getPool, sql } from "./db";

export type SessionCompany = {
  id: number;
  name: string;
  isActive: boolean;
};

export type SessionDTO = {
  user: { id: number; username: string; fullName: string };
  company: SessionCompany | null;
  companies: SessionCompany[];
  access: AccessSnapshot;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const getSession = cache(async (): Promise<SessionDTO | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const selectedId = await readCompanyCookie();
  const pool = await getPool();
  const userResult = await pool
    .request()
    .input("tokenHash", sql.Char(64), hashSessionToken(token))
    .query<{
      user_id: number;
      username: string;
      full_name: string | null;
      is_super_user: boolean;
      role_id: number | null;
      role_is_active: boolean | null;
    }>(`
      SELECT
        u.id AS user_id,
        u.username,
        u.full_name,
        u.is_super_user,
        u.role_id,
        r.is_active AS role_is_active
      FROM dbo.user_sessions AS s
      INNER JOIN dbo.users AS u ON u.id = s.user_id
      LEFT JOIN dbo.roles AS r ON r.id = u.role_id
      WHERE s.token_hash = @tokenHash
        AND s.expires_at > SYSUTCDATETIME()
        AND u.is_active = 1
    `);

  const userRow = userResult.recordset[0];
  if (!userRow) {
    return null;
  }

  const companiesResult = await pool
    .request()
    .input("userId", sql.Int, userRow.user_id)
    .query<{ id: number; name: string; is_active: boolean }>(`
      SELECT c.id, c.name, c.is_active
      FROM dbo.user_companies AS uc
      INNER JOIN dbo.companies AS c ON c.id = uc.company_id
      WHERE uc.user_id = @userId
      ORDER BY c.name
    `);

  const companies: SessionCompany[] = companiesResult.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
  }));

  const selected = companies.find((company) => company.id === selectedId);
  const current =
    selected?.isActive
      ? selected
      : (companies.find((company) => company.isActive) ?? null);

  const isSuperUser = Boolean(userRow.is_super_user);
  const permissions = emptyPermissions();
  if (!isSuperUser && userRow.role_id && userRow.role_is_active) {
    const permissionResult = await pool
      .request()
      .input("roleId", sql.Int, userRow.role_id)
      .query<{
        feature_key: string;
        can_read: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_run: boolean;
        can_approve: boolean;
      }>(`
        SELECT feature_key, can_read, can_insert, can_update, can_delete, can_run, can_approve
        FROM dbo.role_permissions
        WHERE role_id = @roleId
      `);
    for (const row of permissionResult.recordset) {
      permissions[row.feature_key] = permissionActions(row);
    }
  }

  return {
    user: {
      id: userRow.user_id,
      username: userRow.username,
      fullName: userRow.full_name ?? userRow.username,
    },
    company: current,
    companies,
    access: { isSuperUser, permissions },
  };
});

function permissionActions(row: {
  feature_key: string;
  can_read: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_run: boolean;
  can_approve: boolean;
}): RolePermissionActions {
  const feature = PERMISSION_FEATURES.find((item) => item.key === row.feature_key);
  return {
    ...emptyPermissionActions(Boolean(feature?.hasRun), Boolean(feature?.hasApprove)),
    view: Boolean(row.can_read),
    create: Boolean(row.can_insert),
    edit: Boolean(row.can_update),
    delete: Boolean(row.can_delete),
    ...(feature?.hasRun ? { run: Boolean(row.can_run) } : {}),
    ...(feature?.hasApprove ? { approve: Boolean(row.can_approve) } : {}),
  };
}
