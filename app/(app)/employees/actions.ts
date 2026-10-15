"use server";

import { revalidatePath } from "next/cache";
import type { EmployeeImportRecord, EmployeeInput } from "@/components/employees/employee.types";
import {
  createEmployee,
  deleteEmployee,
  importEmployees,
  listEmployeesForExport,
  updateEmployee,
} from "@/server/employees";

function revalidateEmployees() {
  revalidatePath("/employees");
}

export async function createEmployeeAction(input: EmployeeInput) {
  const result = await createEmployee(input);
  if (!("error" in result)) {
    revalidateEmployees();
  }
  return result;
}

export async function updateEmployeeAction(id: number, input: EmployeeInput) {
  const result = await updateEmployee(id, input);
  if (!("error" in result)) {
    revalidateEmployees();
  }
  return result;
}

export async function deleteEmployeeAction(id: number) {
  const result = await deleteEmployee(id);
  if (!("error" in result)) {
    revalidateEmployees();
  }
  return result;
}

export async function exportEmployeesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listEmployeesForExport(query);
}

export async function importEmployeesAction(
  records: EmployeeImportRecord[],
  dryRun: boolean,
) {
  const result = await importEmployees(records, dryRun);
  if (!dryRun && result.problems.length === 0) {
    revalidateEmployees();
  }
  return result.problems;
}
