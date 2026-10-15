"use server";

import { revalidatePath } from "next/cache";
import {
  createEmployeeCategory,
  deleteEmployeeCategory,
  listEmployeeCategoriesForExport,
  updateEmployeeCategory,
  type EmployeeCategoryInput,
} from "@/server/employee-categories";

function revalidateEmployeeCategories() {
  revalidatePath("/employee-categories");
}

export async function createEmployeeCategoryAction(input: EmployeeCategoryInput) {
  const result = await createEmployeeCategory(input);
  if (!("error" in result)) {
    revalidateEmployeeCategories();
  }
  return result;
}

export async function updateEmployeeCategoryAction(
  id: number,
  input: EmployeeCategoryInput,
) {
  const result = await updateEmployeeCategory(id, input);
  if (!("error" in result)) {
    revalidateEmployeeCategories();
  }
  return result;
}

export async function deleteEmployeeCategoryAction(id: number) {
  const result = await deleteEmployeeCategory(id);
  if (!("error" in result)) {
    revalidateEmployeeCategories();
  }
  return result;
}

export async function exportEmployeeCategoriesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listEmployeeCategoriesForExport(query);
}
