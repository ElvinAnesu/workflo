import "server-only";
import sql from "mssql";

// One connection pool per server process. Kept on globalThis so dev-mode
// hot reloads reuse it instead of opening a new pool on every edit.
const globalForDb = globalThis as unknown as { workfloPool?: Promise<sql.ConnectionPool> };

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local (see .env.example).`);
  }
  return value;
}

function createPool() {
  const pool = new sql.ConnectionPool({
    server: requiredEnv("DB_SERVER"),
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: requiredEnv("DB_PASSWORD"),
    options: {
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    },
  });

  return pool.connect().catch((error: unknown) => {
    // Let the next request try again instead of caching the failure.
    globalForDb.workfloPool = undefined;
    throw error;
  });
}

export function getPool() {
  globalForDb.workfloPool ??= createPool();
  return globalForDb.workfloPool;
}

export { sql };
