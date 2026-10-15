import "server-only";
import { cookies } from "next/headers";

export const COMPANY_COOKIE = "workflo-company";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readCompanyCookie() {
  const cookieStore = await cookies();
  const id = Number(cookieStore.get(COMPANY_COOKIE)?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function writeCompanyCookie(companyId: number | null) {
  const cookieStore = await cookies();
  if (companyId === null) {
    cookieStore.delete(COMPANY_COOKIE);
    return;
  }
  cookieStore.set(COMPANY_COOKIE, String(companyId), {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
  });
}
