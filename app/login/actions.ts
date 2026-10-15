"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/server/auth";

export async function loginAction(username: string, password: string, nextPath: string) {
  const result = await login(username, password);
  if ("error" in result) {
    return result;
  }
  redirect(nextPath);
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
