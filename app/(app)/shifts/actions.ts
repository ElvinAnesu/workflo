"use server";

import { revalidatePath } from "next/cache";
import type { ShiftInput } from "@/components/shifts/shift.types";
import {
  createShift,
  deleteShift,
  listShiftsForExport,
  updateShift,
} from "@/server/shifts";

function revalidateShifts() {
  revalidatePath("/shifts");
}

export async function createShiftAction(input: ShiftInput) {
  const result = await createShift(input);
  if (!("error" in result)) {
    revalidateShifts();
  }
  return result;
}

export async function updateShiftAction(id: number, input: ShiftInput) {
  const result = await updateShift(id, input);
  if (!("error" in result)) {
    revalidateShifts();
  }
  return result;
}

export async function deleteShiftAction(id: number) {
  const result = await deleteShift(id);
  if (!("error" in result)) {
    revalidateShifts();
  }
  return result;
}

export async function exportShiftsAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listShiftsForExport(query);
}
