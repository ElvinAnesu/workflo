"use server";

import { revalidatePath } from "next/cache";
import type { LeaveTypeInput } from "@/components/leave-types/leave-type.types";
import type { LeaveEmployeeFilter } from "@/components/leave-types/leave-type.types";
import {
  createLeaveType,
  deleteLeaveType,
  listLeaveEmployees,
  listLeaveTypesForExport,
  updateLeaveType,
} from "@/server/leave";

function revalidateLeave() {
  revalidatePath("/leave-types");
  revalidatePath("/leave/balances");
  revalidatePath("/leave/requests");
}

export async function createLeaveTypeAction(input: LeaveTypeInput) {
  const result = await createLeaveType(input);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function updateLeaveTypeAction(id: number, input: LeaveTypeInput) {
  const result = await updateLeaveType(id, input);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function deleteLeaveTypeAction(id: number) {
  const result = await deleteLeaveType(id);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function listLeaveEmployeesAction(query: LeaveEmployeeFilter) {
  return listLeaveEmployees(query);
}

export async function exportLeaveTypesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listLeaveTypesForExport(query);
}
