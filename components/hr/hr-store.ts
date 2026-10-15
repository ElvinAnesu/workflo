"use client";

import type { AppraisalCycleRow } from "@/components/appraisal-cycles/appraisal-cycle.types";
import type { AppraisalRow } from "@/components/appraisals/appraisal.types";
import type { AttendanceRow } from "@/components/attendance/attendance.types";
import type { BranchRow } from "@/components/branches/branch.types";
import type { DepartmentRow } from "@/components/departments/department.types";
import type { EmployeeCategoryRow } from "@/components/employee-categories/employee-category.types";
import {
  countEmployeesWith,
  renameEmployeeLookup,
  type EmployeeLookupField,
} from "@/components/employees/employees-store";
import type { EmploymentTypeRow } from "@/components/employment-types/employment-type.types";
import type { KpiRow } from "@/components/kpis/kpi.types";
import type { LeaveBalanceRow } from "@/components/leave-balances/leave-balance.types";
import type { LeaveRequestRow } from "@/components/leave-requests/leave-request.types";
import type { LeaveTypeRow } from "@/components/leave-types/leave-type.types";
import type { RoleRow } from "@/components/roles/role.types";
import type { ScorecardRow } from "@/components/scorecards/scorecard.types";
import type { ShiftRow } from "@/components/shifts/shift.types";
import type { TimetableRow } from "@/components/timetable/timetable.types";
import type { UserRow } from "@/components/users/user.types";
import {
  createPersistentStore,
  prefixedId,
} from "@/components/store/persistent-store";

// Client-side data for the HR setup, leave, attendance, performance and
// user-management screens, persisted to localStorage until a backend exists.

export type HrState = {
  branches: BranchRow[];
  departments: DepartmentRow[];
  employeeCategories: EmployeeCategoryRow[];
  employmentTypes: EmploymentTypeRow[];
  shifts: ShiftRow[];
  timetable: TimetableRow[];
  leaveTypes: LeaveTypeRow[];
  leaveBalances: LeaveBalanceRow[];
  leaveRequests: LeaveRequestRow[];
  attendance: AttendanceRow[];
  kpis: KpiRow[];
  appraisalCycles: AppraisalCycleRow[];
  scorecards: ScorecardRow[];
  appraisals: AppraisalRow[];
  roles: RoleRow[];
  users: UserRow[];
};

export type HrCollection = keyof HrState;
export type HrItem<K extends HrCollection> = HrState[K][number];

const store = createPersistentStore<HrState>("workflo.hr.v1", {
  branches: [],
  departments: [],
  employeeCategories: [],
  employmentTypes: [],
  shifts: [],
  timetable: [],
  leaveTypes: [],
  leaveBalances: [],
  leaveRequests: [],
  attendance: [],
  kpis: [],
  appraisalCycles: [],
  scorecards: [],
  appraisals: [],
  roles: [],
  users: [],
});

export const useHrState = store.useStore;
export const getHrState = store.getState;

const ID_PREFIX: Record<HrCollection, string> = {
  branches: "BR-",
  departments: "DP-",
  employeeCategories: "EC-",
  employmentTypes: "ET-",
  shifts: "SH-",
  timetable: "TT-",
  leaveTypes: "LT-",
  leaveBalances: "LB-",
  leaveRequests: "LR-",
  attendance: "AT-",
  kpis: "KPI-",
  appraisalCycles: "AC-",
  scorecards: "SC-",
  appraisals: "AP-",
  roles: "RL-",
  users: "US-",
};

type NewItem<K extends HrCollection> = Omit<HrItem<K>, "id"> & { id?: string };

export function saveItem<K extends HrCollection>(key: K, item: NewItem<K>) {
  const items = store.getState()[key] as HrItem<K>[];
  const saved = {
    ...item,
    id: item.id || prefixedId(ID_PREFIX[key], items.map((existing) => existing.id), 4),
  } as HrItem<K>;

  store.setState((current) => {
    const list = current[key] as HrItem<K>[];
    const exists = list.some((existing) => existing.id === saved.id);
    return {
      ...current,
      [key]: exists
        ? list.map((existing) => (existing.id === saved.id ? saved : existing))
        : [...list, saved],
    };
  });
  return saved;
}

export function saveItems<K extends HrCollection>(key: K, items: NewItem<K>[]) {
  return items.map((item) => saveItem(key, item));
}

export function deleteItem<K extends HrCollection>(key: K, id: string) {
  store.setState((current) => ({
    ...current,
    [key]: (current[key] as HrItem<K>[]).filter((item) => item.id !== id),
  }));
}

export function updateItems<K extends HrCollection>(
  key: K,
  update: (items: HrItem<K>[]) => HrItem<K>[],
) {
  store.setState((current) => ({
    ...current,
    [key]: update(current[key] as HrItem<K>[]),
  }));
}

// Lookups that employees reference by name ------------------------------------

export const EMPLOYEE_LOOKUPS = {
  branches: { field: "branch", nameKey: "branchName", label: "branch" },
  departments: { field: "department", nameKey: "departmentName", label: "department" },
  employeeCategories: {
    field: "employeeCategory",
    nameKey: "employeeCategoryName",
    label: "employee category",
  },
  employmentTypes: {
    field: "employmentType",
    nameKey: "employmentTypeName",
    label: "employment type",
  },
} as const satisfies Record<
  string,
  { field: EmployeeLookupField; nameKey: string; label: string }
>;

export type EmployeeLookupCollection = keyof typeof EMPLOYEE_LOOKUPS;

function lookupName<K extends EmployeeLookupCollection>(key: K, item: HrItem<K>) {
  return (item as Record<string, unknown>)[EMPLOYEE_LOOKUPS[key].nameKey] as string;
}

export function lookupNames<K extends EmployeeLookupCollection>(state: HrState, key: K) {
  return (state[key] as HrItem<K>[])
    .map((item) => lookupName(key, item))
    .sort((a, b) => a.localeCompare(b));
}

// Returns an error message, or "" when saved. Renames carry over to employees.
export function saveLookup<K extends EmployeeLookupCollection>(key: K, item: NewItem<K>) {
  const config = EMPLOYEE_LOOKUPS[key];
  const name = ((item as Record<string, unknown>)[config.nameKey] as string).trim();
  const items = store.getState()[key] as HrItem<K>[];

  if (!name) {
    return `Enter a ${config.label} name.`;
  }
  if (
    items.some(
      (existing) =>
        existing.id !== item.id &&
        lookupName(key, existing).toLowerCase() === name.toLowerCase(),
    )
  ) {
    return `A ${config.label} called "${name}" already exists.`;
  }

  const previous = items.find((existing) => existing.id === item.id);
  saveItem(key, { ...item, [config.nameKey]: name } as NewItem<K>);
  if (previous) {
    renameEmployeeLookup(config.field, lookupName(key, previous), name);
  }
  return "";
}

// Returns why the item cannot be deleted, or "" when it is not in use.
export function lookupUsage<K extends EmployeeLookupCollection>(key: K, item: HrItem<K>) {
  const config = EMPLOYEE_LOOKUPS[key];
  const employees = countEmployeesWith(config.field, lookupName(key, item));
  const state = store.getState();
  const shifts =
    key === "branches"
      ? state.shifts.filter((shift) => shift.branchId === item.id).length
      : key === "departments"
        ? state.shifts.filter((shift) => shift.departmentId === item.id).length
        : 0;
  const reasons = [
    employees > 0 ? `${employees} employee${employees === 1 ? "" : "s"}` : "",
    shifts > 0 ? `${shifts} shift${shifts === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return reasons.length > 0 ? `It is used by ${reasons.join(" and ")}.` : "";
}
