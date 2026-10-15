"use server";

import { revalidatePath } from "next/cache";
import {
  createRole,
  deleteRole,
  listRolesForExport,
  updateRole,
  type RoleInput,
} from "@/server/roles";

function revalidateRoles() {
  revalidatePath("/roles");
  revalidatePath("/users");
}

export async function createRoleAction(input: RoleInput) {
  const result = await createRole(input);
  if (!("error" in result)) {
    revalidateRoles();
  }
  return result;
}

export async function updateRoleAction(id: number, input: RoleInput) {
  const result = await updateRole(id, input);
  if (!("error" in result)) {
    revalidateRoles();
  }
  return result;
}

export async function deleteRoleAction(id: number) {
  const result = await deleteRole(id);
  if (!("error" in result)) {
    revalidateRoles();
  }
  return result;
}

export async function exportRolesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listRolesForExport(query);
}
