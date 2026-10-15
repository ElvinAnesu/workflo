"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceInput, MarkAttendanceSaveRow } from "@/components/attendance/attendance.types";
import {
  createAttendance,
  deleteAttendance,
  listAttendanceForExport,
  listMarkAttendanceForExport,
  listMarkRoster,
  saveMarkAttendance,
  updateAttendance,
} from "@/server/attendance";

function revalidateAttendance() {
  revalidatePath("/attendance/mark");
  revalidatePath("/attendance/view");
}

export async function listMarkRosterAction(query: { workDate: string; shiftId: number }) {
  return listMarkRoster(query);
}

export async function saveMarkAttendanceAction(input: {
  workDate: string;
  shiftId: number;
  rows: MarkAttendanceSaveRow[];
}) {
  const result = await saveMarkAttendance(input);
  if (!("error" in result)) {
    revalidateAttendance();
  }
  return result;
}

export async function exportMarkAttendanceAction(query: {
  workDate: string;
  shiftId: number;
  search: string;
  sortDirection: "asc" | "desc";
}) {
  return listMarkAttendanceForExport(query);
}

export async function createAttendanceAction(input: AttendanceInput) {
  const result = await createAttendance(input);
  if (!("error" in result)) {
    revalidateAttendance();
  }
  return result;
}

export async function updateAttendanceAction(id: number, input: AttendanceInput) {
  const result = await updateAttendance(id, input);
  if (!("error" in result)) {
    revalidateAttendance();
  }
  return result;
}

export async function deleteAttendanceAction(id: number) {
  const result = await deleteAttendance(id);
  if (!("error" in result)) {
    revalidateAttendance();
  }
  return result;
}

export async function exportAttendanceAction(query: {
  month: string;
  status: string;
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listAttendanceForExport(query);
}
