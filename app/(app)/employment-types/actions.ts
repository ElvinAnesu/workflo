"use server";

import { revalidatePath } from "next/cache";
import {
  createEmploymentType,
  deleteEmploymentType,
  listEmploymentTypesForExport,
  updateEmploymentType,
  type EmploymentTypeInput,
} from "@/server/employment-types";

function revalidateEmploymentTypes() {
  revalidatePath("/employment-types");
}

export async function createEmploymentTypeAction(input: EmploymentTypeInput) {
  const result = await createEmploymentType(input);
  if (!("error" in result)) {
    revalidateEmploymentTypes();
  }
  return result;
}

export async function updateEmploymentTypeAction(
  id: number,
  input: EmploymentTypeInput,
) {
  const result = await updateEmploymentType(id, input);
  if (!("error" in result)) {
    revalidateEmploymentTypes();
  }
  return result;
}

export async function deleteEmploymentTypeAction(id: number) {
  const result = await deleteEmploymentType(id);
  if (!("error" in result)) {
    revalidateEmploymentTypes();
  }
  return result;
}

export async function exportEmploymentTypesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listEmploymentTypesForExport(query);
}
