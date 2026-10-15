"use server";

import { revalidatePath } from "next/cache";
import type { TimetableEmployeeFilter, TimetableInput } from "@/components/timetable/timetable.types";
import {
  createTimetable,
  deleteTimetable,
  listTimetableEmployees,
  listTimetableForExport,
  updateTimetable,
} from "@/server/timetable";

function revalidateTimetable() {
  revalidatePath("/timetable");
}

export async function createTimetableAction(input: TimetableInput) {
  const result = await createTimetable(input);
  if (!("error" in result)) {
    revalidateTimetable();
  }
  return result;
}

export async function updateTimetableAction(id: number, input: TimetableInput) {
  const result = await updateTimetable(id, input);
  if (!("error" in result)) {
    revalidateTimetable();
  }
  return result;
}

export async function deleteTimetableAction(id: number) {
  const result = await deleteTimetable(id);
  if (!("error" in result)) {
    revalidateTimetable();
  }
  return result;
}

export async function listTimetableEmployeesAction(query: TimetableEmployeeFilter) {
  return listTimetableEmployees(query);
}

export async function exportTimetableAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listTimetableForExport(query);
}
