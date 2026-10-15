"use server";

import { revalidatePath } from "next/cache";
import {
  createCompany,
  listCompaniesForExport,
  setCompanyActive,
  switchCompany,
  updateCompany,
  type CompanyInput,
} from "@/server/companies";

function revalidateCompany() {
  revalidatePath("/company");
  revalidatePath("/manage-companies");
  revalidatePath("/", "layout");
}

export async function createCompanyAction(input: CompanyInput) {
  const result = await createCompany(input);
  if (!("error" in result)) {
    revalidateCompany();
  }
  return result;
}

export async function updateCompanyAction(id: number, input: CompanyInput) {
  const result = await updateCompany(id, input);
  if (!("error" in result)) {
    revalidateCompany();
  }
  return result;
}

export async function setCompanyActiveAction(id: number, isActive: boolean) {
  const result = await setCompanyActive(id, isActive);
  if (!("error" in result)) {
    revalidateCompany();
  }
  return result;
}

export async function switchCompanyAction(id: number) {
  const result = await switchCompany(id);
  if (!("error" in result)) {
    revalidateCompany();
  }
  return result;
}

export async function exportCompaniesAction(query: {
  search: string;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  return listCompaniesForExport(query);
}
