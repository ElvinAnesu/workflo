"use server";

import { revalidatePath } from "next/cache";
import type {
  HiringCandidateSaveInput,
  HiringListQuery,
  HiringRequestSaveInput,
} from "@/components/hiring/hiring.types";
import {
  cancelHiringRequest,
  confirmHiringCandidate,
  createHiringCandidate,
  createHiringRequest,
  decideHiringRequest,
  getHiringRequest,
  listHiringCandidatesForExport,
  listHiringFormOptions,
  listHiringRequestsForExport,
  markHiringCandidateConverted,
  rejectHiringCandidate,
  selectHiringCandidate,
  unselectHiringCandidate,
  updateHiringCandidate,
  updateHiringRequest,
} from "@/server/hiring";

function revalidateHiring() {
  revalidatePath("/hiring/requests");
  revalidatePath("/hiring/candidates");
}

export async function listHiringFormOptionsAction() {
  return listHiringFormOptions();
}

export async function getHiringRequestAction(id: number) {
  return getHiringRequest(id);
}

export async function exportHiringRequestsAction(query: Omit<HiringListQuery, "page" | "pageSize">) {
  return listHiringRequestsForExport(query);
}

export async function exportHiringCandidatesAction(query: Omit<HiringListQuery, "page" | "pageSize">) {
  return listHiringCandidatesForExport(query);
}

export async function createHiringRequestAction(input: HiringRequestSaveInput) {
  const result = await createHiringRequest(input);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function updateHiringRequestAction(id: number, input: HiringRequestSaveInput) {
  const result = await updateHiringRequest(id, input);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function decideHiringRequestAction(
  id: number,
  decision: "Approved" | "Rejected",
  decisionBy: string,
  decisionComment: string,
) {
  const result = await decideHiringRequest(id, decision, decisionBy, decisionComment);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function cancelHiringRequestAction(id: number) {
  const result = await cancelHiringRequest(id);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function createHiringCandidateAction(input: HiringCandidateSaveInput) {
  const result = await createHiringCandidate(input);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function updateHiringCandidateAction(id: number, input: HiringCandidateSaveInput) {
  const result = await updateHiringCandidate(id, input);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function selectHiringCandidateAction(id: number) {
  const result = await selectHiringCandidate(id);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function unselectHiringCandidateAction(id: number) {
  const result = await unselectHiringCandidate(id);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function rejectHiringCandidateAction(id: number) {
  const result = await rejectHiringCandidate(id);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function confirmHiringCandidateAction(id: number, startDate: string) {
  const result = await confirmHiringCandidate(id, startDate);
  if (!("error" in result)) {
    revalidateHiring();
  }
  return result;
}

export async function markHiringCandidateConvertedAction(candidateId: number, employeeId: number) {
  const result = await markHiringCandidateConverted(candidateId, employeeId);
  if (!("error" in result)) {
    revalidateHiring();
    revalidatePath("/employees");
  }
  return result;
}
