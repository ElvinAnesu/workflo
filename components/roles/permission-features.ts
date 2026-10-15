import type { RolePermissionActions } from "@/components/roles/role.types";

export type PermissionGroup =
  | "Employee Management"
  | "Payroll"
  | "System Config";

export type PermissionFeature = {
  key: string;
  label: string;
  group: PermissionGroup;
  hasRun: boolean;
  hasApprove?: boolean;
};

export const PERMISSION_FEATURES: PermissionFeature[] = [
  { key: "employees", label: "Employees", group: "Employee Management", hasRun: false },
  { key: "markAttendance", label: "Mark attendance", group: "Employee Management", hasRun: false },
  { key: "viewAttendance", label: "View attendance", group: "Employee Management", hasRun: false },
  { key: "leaveRequests", label: "Leave requests", group: "Employee Management", hasRun: false },
  { key: "leaveBalances", label: "Leave balances", group: "Employee Management", hasRun: false },
  { key: "scorecards", label: "Scorecards", group: "Employee Management", hasRun: false },
  { key: "appraisals", label: "Appraisals", group: "Employee Management", hasRun: false },
  {
    key: "hiringRequests",
    label: "Hiring requests",
    group: "Employee Management",
    hasRun: false,
    hasApprove: true,
  },
  { key: "candidates", label: "Candidates", group: "Employee Management", hasRun: false },
  {
    key: "midMonthPayrollProcessing",
    label: "Mid month payroll processing",
    group: "Payroll",
    hasRun: true,
  },
  {
    key: "overtimeMonthPayrollProcessing",
    label: "Overtime month payroll processing",
    group: "Payroll",
    hasRun: true,
  },
  {
    key: "monthlyPayrollProcessing",
    label: "Monthly payroll processing",
    group: "Payroll",
    hasRun: true,
    hasApprove: true,
  },
  { key: "loanManagement", label: "Loan management", group: "Payroll", hasRun: false },
  { key: "payslipViewer", label: "Payslip viewer", group: "Payroll", hasRun: false },
  {
    key: "componentAssignment",
    label: "Component assignment",
    group: "Payroll",
    hasRun: false,
  },
  {
    key: "employeeSalaryOnHold",
    label: "Employee salary on hold",
    group: "Payroll",
    hasRun: false,
  },
  { key: "advancePayments", label: "Advance payments", group: "Payroll", hasRun: false },
  {
    key: "paymentsRecovery",
    label: "Payments recovery",
    group: "Payroll",
    hasRun: false,
  },
  { key: "company", label: "Company", group: "System Config", hasRun: false },
  { key: "branches", label: "Branches", group: "System Config", hasRun: false },
  { key: "departments", label: "Departments", group: "System Config", hasRun: false },
  {
    key: "employeeCategory",
    label: "Employee Category",
    group: "System Config",
    hasRun: false,
  },
  {
    key: "employmentType",
    label: "Employment Type",
    group: "System Config",
    hasRun: false,
  },
  { key: "shifts", label: "Shifts", group: "System Config", hasRun: false },
  { key: "timetable", label: "Timetable", group: "System Config", hasRun: false },
  { key: "leaveTypes", label: "Leave types", group: "System Config", hasRun: false },
  { key: "payComponents", label: "Pay components", group: "System Config", hasRun: false },
  { key: "statutoryRates", label: "Statutory rates", group: "System Config", hasRun: false },
  { key: "taxBands", label: "Tax bands", group: "System Config", hasRun: false },
  { key: "banks", label: "Banks", group: "System Config", hasRun: false },
  { key: "kpis", label: "KPIs", group: "System Config", hasRun: false },
  { key: "appraisalCycles", label: "Appraisal cycles", group: "System Config", hasRun: false },
  { key: "users", label: "Users", group: "System Config", hasRun: false },
  { key: "roles", label: "Roles & permissions", group: "System Config", hasRun: false },
];

export const PERMISSION_GROUPS: PermissionGroup[] = [
  "Employee Management",
  "Payroll",
  "System Config",
];

export const SUPER_ADMIN_PROTECTED_KEYS = ["users", "roles"] as const;

export function emptyPermissionActions(
  hasRun: boolean,
  hasApprove = false,
): RolePermissionActions {
  return {
    view: false,
    create: false,
    edit: false,
    delete: false,
    ...(hasRun ? { run: false } : {}),
    ...(hasApprove ? { approve: false } : {}),
  };
}

export function emptyPermissions(): Record<string, RolePermissionActions> {
  const permissions: Record<string, RolePermissionActions> = {};

  for (const feature of PERMISSION_FEATURES) {
    permissions[feature.key] = emptyPermissionActions(
      feature.hasRun,
      feature.hasApprove,
    );
  }

  return permissions;
}
