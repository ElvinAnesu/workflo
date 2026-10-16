import "server-only";
import { redirect } from "next/navigation";
import {
  can,
  canAny,
  firstAllowedHref,
  type AccessAction,
} from "@/lib/access";
import { getSession, type SessionDTO } from "./session";

export const ACCESS_DENIED = "You do not have permission to do that.";

type SignedIn = SessionDTO & { company: NonNullable<SessionDTO["company"]> };

export async function requireFeature(
  feature: string,
  action: AccessAction,
): Promise<SignedIn | { error: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }
  if (!can(session.access, feature, action)) {
    return { error: ACCESS_DENIED };
  }
  return session as SignedIn;
}

export async function requireAnyFeature(
  checks: { feature: string; action: AccessAction }[],
): Promise<SignedIn | { error: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "No signed-in user." };
  }
  if (!session.company) {
    return { error: "No current company." };
  }
  if (!canAny(session.access, checks)) {
    return { error: ACCESS_DENIED };
  }
  return session as SignedIn;
}

export async function requireView(feature: string) {
  const session = await getSession();
  if (session && can(session.access, feature, "view")) {
    return;
  }
  redirect(firstAllowedHref(session?.access) ?? "/");
}
