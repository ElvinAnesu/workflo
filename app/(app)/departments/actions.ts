"use server";

import { revalidatePath } from "next/cache";
import {
  createDepartment,
  importDepartments,
  listDepartmentsForExport,
  setDepartmentActive,
  updateDepartment,
  type DepartmentInput,
} from "@/server/departments";

function revalidateDepartments() {
  revalidatePath("/departments");
}

export async function createDepartmentAction(input: DepartmentInput) {
  const result = await createDepartment(input);
  if (!("error" in result)) {
    revalidateDepartments();
  }
  return result;
}

export async function updateDepartmentAction(id: number, input: DepartmentInput) {
  const result = await updateDepartment(id, input);
  if (!("error" in result)) {
    revalidateDepartments();
  }
  return result;
}

export async function setDepartmentActiveAction(id: number, isActive: boolean) {
  const result = await setDepartmentActive(id, isActive);
  if (!("error" in result)) {
    revalidateDepartments();
  }
  return result;
}

export async function exportDepartmentsAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listDepartmentsForExport(query);
}

export async function importDepartmentsAction(
  records: { name: string; code: string }[],
  dryRun: boolean,
) {
  const result = await importDepartments(records, dryRun);
  if (!dryRun && result.problems.length === 0) {
    revalidateDepartments();
  }
  return result.problems;
}
