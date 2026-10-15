"use server";

import { revalidatePath } from "next/cache";
import type { LeaveBalanceInput } from "@/components/leave-balances/leave-balance.types";
import type { LeaveRequestInput } from "@/components/leave-requests/leave-request.types";
import {
  createLeaveRequest,
  decideLeaveRequest,
  deleteLeaveBalance,
  deleteLeaveRequest,
  leaveRemaining,
  listLeaveBalancesForExport,
  listLeaveRequestsForExport,
  listRequestLeaveTypes,
  updateLeaveBalance,
  updateLeaveRequest,
} from "@/server/leave";

function revalidateLeave() {
  revalidatePath("/leave-types");
  revalidatePath("/leave/balances");
  revalidatePath("/leave/requests");
}

export async function updateLeaveBalanceAction(input: LeaveBalanceInput) {
  const result = await updateLeaveBalance(input);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function deleteLeaveBalanceAction(employeeId: number, leaveTypeId: number, year: number) {
  const result = await deleteLeaveBalance(employeeId, leaveTypeId, year);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function listRequestLeaveTypesAction(employeeId: number, includeTypeId: number | null) {
  return listRequestLeaveTypes(employeeId, includeTypeId);
}

export async function exportLeaveBalancesAction(query: {
  year: number | null;
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listLeaveBalancesForExport(query);
}

export async function leaveRemainingAction(query: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  excludeRequestId: number | null;
}) {
  return leaveRemaining(query);
}

export async function createLeaveRequestAction(input: LeaveRequestInput) {
  const result = await createLeaveRequest(input);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function updateLeaveRequestAction(id: number, input: LeaveRequestInput) {
  const result = await updateLeaveRequest(id, input);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function deleteLeaveRequestAction(id: number) {
  const result = await deleteLeaveRequest(id);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function decideLeaveRequestAction(id: number, decision: "Approved" | "Rejected") {
  const result = await decideLeaveRequest(id, decision);
  if (!("error" in result)) {
    revalidateLeave();
  }
  return result;
}

export async function exportLeaveRequestsAction(query: {
  status: string;
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listLeaveRequestsForExport(query);
}
