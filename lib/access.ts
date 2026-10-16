import type { RolePermissionActions } from "@/components/roles/role.types";

export type AccessAction = "view" | "create" | "edit" | "delete" | "run" | "approve";

export type AccessSnapshot = {
  isSuperUser: boolean;
  permissions: Record<string, RolePermissionActions>;
};

// Menu order. The first page the user can view is where they land.
// Longer paths are matched first so /leave/requests does not collide with a shorter prefix.
export const PAGE_ACCESS: { href: string; feature: string }[] = [
  { href: "/employees", feature: "employees" },
  { href: "/attendance/mark", feature: "markAttendance" },
  { href: "/attendance/view", feature: "viewAttendance" },
  { href: "/leave/requests", feature: "leaveRequests" },
  { href: "/leave/balances", feature: "leaveBalances" },
  { href: "/hiring/requests", feature: "hiringRequests" },
  { href: "/hiring/candidates", feature: "candidates" },
  { href: "/payroll/mid-month", feature: "midMonthPayrollProcessing" },
  { href: "/payroll/overtime", feature: "overtimeMonthPayrollProcessing" },
  { href: "/payroll/monthly", feature: "monthlyPayrollProcessing" },
  { href: "/payroll/loans", feature: "loanManagement" },
  { href: "/payroll/payslips", feature: "payslipViewer" },
  { href: "/payroll/component-assignment", feature: "componentAssignment" },
  { href: "/payroll/salary-hold", feature: "employeeSalaryOnHold" },
  { href: "/payroll/advances", feature: "advancePayments" },
  { href: "/payroll/recoveries", feature: "paymentsRecovery" },
  { href: "/company", feature: "company" },
  { href: "/branches", feature: "branches" },
  { href: "/departments", feature: "departments" },
  { href: "/employee-categories", feature: "employeeCategory" },
  { href: "/employment-types", feature: "employmentType" },
  { href: "/shifts", feature: "shifts" },
  { href: "/timetable", feature: "timetable" },
  { href: "/leave-types", feature: "leaveTypes" },
  { href: "/settings/pay-components", feature: "payComponents" },
  { href: "/settings/statutory-rates", feature: "statutoryRates" },
  { href: "/settings/tax-bands", feature: "taxBands" },
  { href: "/settings/overtime", feature: "overtimeRates" },
  { href: "/settings/banks", feature: "banks" },
  { href: "/users", feature: "users" },
  { href: "/roles", feature: "roles" },
  { href: "/manage-companies", feature: "company" },
  { href: "/performance/scorecards", feature: "scorecards" },
  { href: "/performance/appraisals", feature: "appraisals" },
  { href: "/kpis", feature: "kpis" },
  { href: "/appraisal-cycles", feature: "appraisalCycles" },
];

export function can(
  access: AccessSnapshot | null | undefined,
  feature: string,
  action: AccessAction,
) {
  if (!access || !feature) {
    return false;
  }
  if (access.isSuperUser) {
    return true;
  }
  return Boolean(access.permissions[feature]?.[action]);
}

export function canAny(
  access: AccessSnapshot | null | undefined,
  checks: { feature: string; action: AccessAction }[],
) {
  return checks.some((check) => can(access, check.feature, check.action));
}

export function featureForPath(pathname: string) {
  const matches = PAGE_ACCESS.filter(
    (page) => pathname === page.href || pathname.startsWith(`${page.href}/`),
  );
  matches.sort((left, right) => right.href.length - left.href.length);
  return matches[0]?.feature ?? null;
}

export function firstAllowedHref(access: AccessSnapshot | null | undefined) {
  for (const page of PAGE_ACCESS) {
    if (can(access, page.feature, "view")) {
      return page.href;
    }
  }
  return null;
}
