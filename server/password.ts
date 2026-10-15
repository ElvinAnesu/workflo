import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import "server-only";

const KEY_LENGTH = 32;
const N = 16384;
const R = 8;
const P = 1;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return new Promise<string>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P }, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(
        `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`,
      );
    });
  });
}

function deriveKey(password: string, salt: Buffer, keyLength: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, r, p }, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived);
    });
  });
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n < 2 || r < 1 || p < 1) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  let derived: Buffer;
  try {
    derived = await deriveKey(password, salt, expected.length, n, r, p);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
