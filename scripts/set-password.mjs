import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import sql from "mssql";

const KEY_LENGTH = 32;
const N = 16384;
const R = 8;
const P = 1;

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P }, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`);
    });
  });
}

function readEnv(name) {
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const index = line.indexOf("=");
    if (line.slice(0, index) === name) {
      return line.slice(index + 1);
    }
  }
  return "";
}

const username = process.env.WORKFLO_USERNAME?.trim() ?? "";
const password = process.env.WORKFLO_PASSWORD ?? "";
if (!username || !password) {
  console.error("Set WORKFLO_USERNAME and WORKFLO_PASSWORD, then run this script again.");
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const pool = await sql.connect({
  server: readEnv("DB_SERVER"),
  port: readEnv("DB_PORT") ? Number(readEnv("DB_PORT")) : undefined,
  database: readEnv("DB_NAME"),
  user: readEnv("DB_USER"),
  password: readEnv("DB_PASSWORD"),
  options: {
    encrypt: readEnv("DB_ENCRYPT") !== "false",
    trustServerCertificate: readEnv("DB_TRUST_SERVER_CERTIFICATE") === "true",
  },
});

const result = await pool
  .request()
  .input("username", sql.NVarChar(100), username)
  .input("passwordHash", sql.NVarChar(255), passwordHash)
  .query(`
    UPDATE dbo.users
    SET password_hash = @passwordHash, updated_at = SYSUTCDATETIME()
    WHERE username = @username
  `);

await pool.close();

if (!result.rowsAffected[0]) {
  console.error("No user with that username.");
  process.exit(1);
}

console.log("Password updated.");
