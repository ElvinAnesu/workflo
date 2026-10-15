import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
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
    }>(`
      SELECT u.id AS user_id, u.username, u.full_name
      FROM dbo.user_sessions AS s
      INNER JOIN dbo.users AS u ON u.id = s.user_id
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

  return {
    user: {
      id: userRow.user_id,
      username: userRow.username,
      fullName: userRow.full_name ?? userRow.username,
    },
    company: current,
    companies,
  };
});
