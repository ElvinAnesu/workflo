"use server";

import { revalidatePath } from "next/cache";
import {
  createUser,
  listUsersForExport,
  setUserActive,
  updateUser,
  type UserInput,
} from "@/server/users";

function revalidateUsers() {
  revalidatePath("/users");
}

export async function createUserAction(input: UserInput) {
  const result = await createUser(input);
  if (!("error" in result)) {
    revalidateUsers();
  }
  return result;
}

export async function updateUserAction(id: number, input: UserInput) {
  const result = await updateUser(id, input);
  if (!("error" in result)) {
    revalidateUsers();
  }
  return result;
}

export async function setUserActiveAction(id: number, isActive: boolean) {
  const result = await setUserActive(id, isActive);
  if (!("error" in result)) {
    revalidateUsers();
  }
  return result;
}

export async function exportUsersAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listUsersForExport(query);
}
