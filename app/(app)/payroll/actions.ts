"use server";

import { revalidatePath } from "next/cache";
import type { DeductionPlanKind, MidMonthBasis, PayrollListQuery } from "@/components/payroll/payroll.types";
import {
  addPlanRepayment,
  approveDeductionPlan,
  approveNamedRun,
  closeDeductionPlan,
  createMidMonthRun,
  createMonthlyRun,
  createOvertimeRun,
  deleteDeductionPlan,
  deleteMidMonthRun,
  deleteMonthlyRun,
  deleteOvertimeEntry,
  deleteOvertimeRun,
  deletePlanRepayment,
  deleteSalaryHold,
  getDeductionPlan,
  getMidMonthRun,
  getMonthlyRun,
  getOvertimeRun,
  getPayAssignment,
  getPayslipLines,
  listDeductionPlans,
  listHoldEmployees,
  listMidMonthRuns,
  listMonthlyRuns,
  listOvertimeRuns,
  listPayAssignments,
  listPayslips,
  listSalaryHolds,
  lockMidMonthRun,
  lockNamedRun,
  lockOvertimeRun,
  pauseDeductionPlan,
  recalculateMidMonthRun,
  recalculateMonthlyRun,
  recalculateOvertimeRun,
  rejectDeductionPlan,
  releaseSalaryHold,
  reopenNamedRun,
  resumeDeductionPlan,
  saveDeductionPlan,
  saveOvertimeEntry,
  savePayAssignment,
  saveSalaryHold,
  setMidMonthAmount,
  setOvertimePayPeriod,
} from "@/server/payroll-operations";
import { payrollReadinessMessage } from "@/server/payroll";

function refreshPayroll() {
  revalidatePath("/payroll/component-assignment");
  revalidatePath("/payroll/salary-hold");
  revalidatePath("/payroll/loans");
  revalidatePath("/payroll/advances");
  revalidatePath("/payroll/recoveries");
  revalidatePath("/payroll/mid-month");
  revalidatePath("/payroll/overtime");
  revalidatePath("/payroll/monthly");
  revalidatePath("/payroll/payslips");
}

export async function readinessAction() {
  return payrollReadinessMessage();
}

export async function listAssignmentsAction(query: PayrollListQuery) {
  return listPayAssignments(query);
}

export async function getAssignmentAction(employeeId: number) {
  return getPayAssignment(employeeId);
}

export async function saveAssignmentAction(values: Parameters<typeof savePayAssignment>[0]) {
  const result = await savePayAssignment(values);
  refreshPayroll();
  return result;
}

export async function listHoldsAction(query: PayrollListQuery) {
  return listSalaryHolds(query);
}

export async function holdEmployeesAction(includeId?: number) {
  return listHoldEmployees(includeId);
}

export async function saveHoldAction(values: Parameters<typeof saveSalaryHold>[0]) {
  const result = await saveSalaryHold(values);
  revalidatePath("/payroll/salary-hold");
  return result;
}

export async function releaseHoldAction(id: number) {
  const result = await releaseSalaryHold(id);
  revalidatePath("/payroll/salary-hold");
  return result;
}

export async function deleteHoldAction(id: number) {
  const result = await deleteSalaryHold(id);
  revalidatePath("/payroll/salary-hold");
  return result;
}

export async function listPlansAction(kind: DeductionPlanKind, query: PayrollListQuery) {
  return listDeductionPlans(kind, query);
}

export async function getPlanAction(id: number) {
  return getDeductionPlan(id);
}

export async function savePlanAction(values: Parameters<typeof saveDeductionPlan>[0]) {
  const result = await saveDeductionPlan(values);
  refreshPayroll();
  return result;
}

export async function approvePlanAction(id: number, approvedBy: string, disbursedOn: string) {
  const result = await approveDeductionPlan(id, approvedBy, disbursedOn);
  refreshPayroll();
  return result;
}

export async function rejectPlanAction(id: number, reason: string) {
  const result = await rejectDeductionPlan(id, reason);
  refreshPayroll();
  return result;
}

export async function pausePlanAction(id: number) {
  const result = await pauseDeductionPlan(id);
  refreshPayroll();
  return result;
}

export async function resumePlanAction(id: number) {
  const result = await resumeDeductionPlan(id);
  refreshPayroll();
  return result;
}

export async function closePlanAction(id: number, reason: string) {
  const result = await closeDeductionPlan(id, reason);
  refreshPayroll();
  return result;
}

export async function addRepaymentAction(id: number, amount: number, date: string, note: string) {
  const result = await addPlanRepayment(id, amount, date, note);
  refreshPayroll();
  return result;
}

export async function deleteRepaymentAction(planId: number, repaymentId: number) {
  const result = await deletePlanRepayment(planId, repaymentId);
  refreshPayroll();
  return result;
}

export async function deletePlanAction(id: number) {
  const result = await deleteDeductionPlan(id);
  refreshPayroll();
  return result;
}

export async function listMonthlyAction(query: PayrollListQuery) {
  return listMonthlyRuns(query);
}

export async function createMonthlyAction(period: string) {
  const result = await createMonthlyRun(period);
  revalidatePath("/payroll/monthly");
  return result;
}

export async function monthlyRunAction(id: number, search = "") {
  return getMonthlyRun(id, search);
}

export async function recalculateMonthlyAction(id: number) {
  const result = await recalculateMonthlyRun(id);
  revalidatePath("/payroll/monthly");
  return result;
}

export async function approveMonthlyAction(id: number, approvedBy: string) {
  const result = await approveNamedRun("payroll_runs", id, approvedBy);
  revalidatePath("/payroll/monthly");
  revalidatePath("/payroll/payslips");
  return result;
}

export async function reopenMonthlyAction(id: number) {
  const result = await reopenNamedRun("payroll_runs", id);
  revalidatePath("/payroll/monthly");
  return result;
}

export async function lockMonthlyAction(id: number) {
  const result = await lockNamedRun("payroll_runs", id);
  revalidatePath("/payroll/monthly");
  revalidatePath("/payroll/payslips");
  return result;
}

export async function deleteMonthlyAction(id: number) {
  const result = await deleteMonthlyRun(id);
  revalidatePath("/payroll/monthly");
  return result;
}

export async function listMidMonthAction(query: PayrollListQuery) {
  return listMidMonthRuns(query);
}

export async function createMidMonthAction(period: string, basis: MidMonthBasis, value: number, paymentDate: string) {
  const result = await createMidMonthRun(period, basis, value, paymentDate);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function midMonthRunAction(id: number) {
  return getMidMonthRun(id);
}

export async function setMidMonthAmountAction(id: number, employeeId: number, amount: number | null) {
  const result = await setMidMonthAmount(id, employeeId, amount);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function recalculateMidMonthAction(id: number, setup?: { basis: MidMonthBasis; value: number; paymentDate: string }) {
  const result = await recalculateMidMonthRun(id, setup);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function approveMidMonthAction(id: number, approvedBy: string) {
  const result = await approveNamedRun("mid_month_runs", id, approvedBy);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function reopenMidMonthAction(id: number) {
  const result = await reopenNamedRun("mid_month_runs", id);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function lockMidMonthAction(id: number) {
  const result = await lockMidMonthRun(id);
  revalidatePath("/payroll/mid-month");
  revalidatePath("/payroll/monthly");
  return result;
}

export async function deleteMidMonthAction(id: number) {
  const result = await deleteMidMonthRun(id);
  revalidatePath("/payroll/mid-month");
  return result;
}

export async function listOvertimeRunsAction(query: PayrollListQuery) {
  return listOvertimeRuns(query);
}

export async function createOvertimeRunAction(period: string, payPeriod: string) {
  const result = await createOvertimeRun(period, payPeriod);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function overtimeRunAction(id: number) {
  return getOvertimeRun(id);
}

export async function saveOvertimeEntryAction(runId: number, values: Parameters<typeof saveOvertimeEntry>[1]) {
  const result = await saveOvertimeEntry(runId, values);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function deleteOvertimeEntryAction(runId: number, entryId: number) {
  const result = await deleteOvertimeEntry(runId, entryId);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function setOvertimePayPeriodAction(id: number, payPeriod: string) {
  const result = await setOvertimePayPeriod(id, payPeriod);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function recalculateOvertimeAction(id: number) {
  const result = await recalculateOvertimeRun(id);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function approveOvertimeAction(id: number, approvedBy: string) {
  const result = await approveNamedRun("overtime_runs", id, approvedBy);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function reopenOvertimeAction(id: number) {
  const result = await reopenNamedRun("overtime_runs", id);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function lockOvertimeAction(id: number) {
  const result = await lockOvertimeRun(id);
  revalidatePath("/payroll/overtime");
  revalidatePath("/payroll/monthly");
  return result;
}

export async function deleteOvertimeRunAction(id: number) {
  const result = await deleteOvertimeRun(id);
  revalidatePath("/payroll/overtime");
  return result;
}

export async function listPayslipsAction(query: Parameters<typeof listPayslips>[0]) {
  return listPayslips(query);
}

export async function payslipLinesAction(keys: string[]) {
  return getPayslipLines(keys);
}
