"use server";

import { revalidatePath } from "next/cache";
import {
  createBranch,
  importBranches,
  listBranchesForExport,
  setBranchActive,
  updateBranch,
  type BranchInput,
} from "@/server/branches";

function revalidateBranches() {
  revalidatePath("/branches");
}

export async function createBranchAction(input: BranchInput) {
  const result = await createBranch(input);
  if (!("error" in result)) {
    revalidateBranches();
  }
  return result;
}

export async function updateBranchAction(id: number, input: BranchInput) {
  const result = await updateBranch(id, input);
  if (!("error" in result)) {
    revalidateBranches();
  }
  return result;
}

export async function setBranchActiveAction(id: number, isActive: boolean) {
  const result = await setBranchActive(id, isActive);
  if (!("error" in result)) {
    revalidateBranches();
  }
  return result;
}

export async function exportBranchesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listBranchesForExport(query);
}

export async function importBranchesAction(
  records: { name: string; location: string }[],
  dryRun: boolean,
) {
  const result = await importBranches(records, dryRun);
  if (!dryRun && result.problems.length === 0) {
    revalidateBranches();
  }
  return result.problems;
}
