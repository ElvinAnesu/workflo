import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";
import { getPool, sql } from "./db";
import { verifyPassword } from "./password";
import { hashSessionToken } from "./session";

const INCORRECT = "Username or password is incorrect.";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function login(username: string, password: string) {
  const cookieStore = await cookies();
  const trimmed = username.trim();
  if (!trimmed || !password) {
    return { error: "Username and password are required." };
  }

  const pool = await getPool();
  const userResult = await pool
    .request()
    .input("username", sql.NVarChar(100), trimmed)
    .query<{ id: number; password_hash: string; is_active: boolean }>(`
      SELECT id, password_hash, is_active
      FROM dbo.users
      WHERE username = @username
    `);

  const user = userResult.recordset[0];
  const passwordMatches = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !user.is_active || !passwordMatches) {
    return { error: INCORRECT };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await pool
    .request()
    .input("userId", sql.Int, user.id)
    .input("tokenHash", sql.Char(64), hashSessionToken(token))
    .input("expiresAt", sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.user_sessions (user_id, token_hash, expires_at)
      VALUES (@userId, @tokenHash, @expiresAt)
    `);
  await pool
    .request()
    .input("id", sql.Int, user.id)
    .query(`UPDATE dbo.users SET last_login_at = SYSUTCDATETIME() WHERE id = @id`);

  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());
  return { ok: true as const };
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);
  if (!token) {
    return;
  }
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("tokenHash", sql.Char(64), hashSessionToken(token))
      .query(`DELETE FROM dbo.user_sessions WHERE token_hash = @tokenHash`);
  } catch {
    // The cookie is already gone, so the browser is signed out.
  }
}
