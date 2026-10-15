"use server";

import { revalidatePath } from "next/cache";
import type { ContributionBase, ContributionScope, PayComponentCalculation, PayComponentType, PayrollListQuery, TaxBand } from "@/components/payroll/payroll.types";
import {
  deleteBank,
  deleteContribution,
  deletePayComponent,
  listBanks,
  listContributions,
  listPayComponents,
  listTaxBands,
  saveBank,
  saveContribution,
  savePayComponent,
  saveTaxBands,
} from "@/server/payroll";
import {
  deleteOvertimeType,
  listOvertimeSettings,
  saveOvertimeHours,
  saveOvertimeType,
} from "@/server/payroll-operations";

function refreshSettings() {
  revalidatePath("/settings/banks");
  revalidatePath("/settings/pay-components");
  revalidatePath("/settings/statutory-rates");
  revalidatePath("/settings/tax-bands");
  revalidatePath("/settings/overtime");
  revalidatePath("/payroll/component-assignment");
}

export async function listBanksAction(query: PayrollListQuery) {
  return listBanks(query);
}

export async function saveBankAction(values: { id?: number; name: string; code: string }) {
  const result = await saveBank(values);
  refreshSettings();
  return result;
}

export async function deleteBankAction(id: number) {
  const result = await deleteBank(id);
  refreshSettings();
  return result;
}

export async function listComponentsAction(query: PayrollListQuery) {
  return listPayComponents(query);
}

export async function saveComponentAction(values: {
  id?: number;
  code: string;
  name: string;
  type: PayComponentType;
  calculation: PayComponentCalculation;
  defaultValue: number;
  taxable: boolean;
  active: boolean;
}) {
  const result = await savePayComponent(values);
  refreshSettings();
  return result;
}

export async function deleteComponentAction(id: number) {
  const result = await deletePayComponent(id);
  refreshSettings();
  return result;
}

export async function listContributionsAction(query: PayrollListQuery) {
  return listContributions(query);
}

export async function saveContributionAction(values: {
  id?: number;
  code: string;
  name: string;
  base: ContributionBase;
  employeeRate: number;
  employerRate: number;
  deductBeforeTax: boolean;
  scope: ContributionScope;
  active: boolean;
}) {
  const result = await saveContribution(values);
  refreshSettings();
  return result;
}

export async function deleteContributionAction(id: number) {
  const result = await deleteContribution(id);
  refreshSettings();
  return result;
}

export async function listTaxBandsAction() {
  return listTaxBands();
}

export async function saveTaxBandsAction(bands: Omit<TaxBand, "id">[]) {
  const result = await saveTaxBands(bands);
  revalidatePath("/settings/tax-bands");
  revalidatePath("/payroll/monthly");
  return result;
}

export async function listOvertimeSettingsAction(query: PayrollListQuery) {
  return listOvertimeSettings(query);
}

export async function saveOvertimeTypeAction(values: Parameters<typeof saveOvertimeType>[0]) {
  const result = await saveOvertimeType(values);
  revalidatePath("/settings/overtime");
  return result;
}

export async function deleteOvertimeTypeAction(id: number) {
  const result = await deleteOvertimeType(id);
  revalidatePath("/settings/overtime");
  return result;
}

export async function saveOvertimeHoursAction(hours: number) {
  const result = await saveOvertimeHours(hours);
  revalidatePath("/settings/overtime");
  return result;
}
